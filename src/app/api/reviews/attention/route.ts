import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { listOpenAuthoredMergeRequestsFast } from "@/lib/gitlab/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Local-only nên nhanh; gitlab=1 vẫn giới hạn. */
export const maxDuration = 30;

const SESSION_LIMIT = 12;
const OPEN_MR_LIMIT = 5;
const RESULT_LIMIT = 20;

export type AttentionItem = {
  id: string;
  kind:
    | "invalid_unpushed"
    | "valid_unpushed"
    | "validating"
    | "failed"
    | "open_mr";
  projectPath: string;
  projectId?: string;
  mrIid: number;
  mrTitle: string | null;
  sourceBranch?: string | null;
  gitlabHost?: string;
  sessionId?: string;
  status?: string;
  invalidUnpushed?: number;
  validUnpushed?: number;
  unresolvedCount?: number | null;
  updatedAt: string;
  webUrl?: string | null;
  reason: string;
};

function buildSessionItems(
  sessions: Array<{
    id: string;
    projectPath: string;
    projectId: string;
    mrIid: number;
    mrTitle: string | null;
    sourceBranch: string;
    gitlabHost: string;
    status: string;
    updatedAt: Date;
    commentResults?: Array<{
      verdict: string | null;
      fixReplyReady: boolean;
    }>;
  }>,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const s of sessions) {
    if (s.status === "validating" || s.status === "pending") {
      items.push({
        id: `session-${s.id}`,
        kind: "validating",
        projectPath: s.projectPath,
        projectId: s.projectId,
        mrIid: s.mrIid,
        mrTitle: s.mrTitle,
        sourceBranch: s.sourceBranch,
        gitlabHost: s.gitlabHost,
        sessionId: s.id,
        status: s.status,
        updatedAt: s.updatedAt.toISOString(),
        reason:
          s.status === "pending"
            ? "Phiên đang chờ / chưa chạy xong"
            : "Đang validate — có thể cần tiếp tục",
      });
      continue;
    }

    if (s.status === "failed") {
      items.push({
        id: `session-${s.id}`,
        kind: "failed",
        projectPath: s.projectPath,
        projectId: s.projectId,
        mrIid: s.mrIid,
        mrTitle: s.mrTitle,
        sourceBranch: s.sourceBranch,
        gitlabHost: s.gitlabHost,
        sessionId: s.id,
        status: s.status,
        updatedAt: s.updatedAt.toISOString(),
        reason: "Phiên validate thất bại",
      });
      continue;
    }

    const comments = s.commentResults ?? [];
    const invalidUnpushed = comments.filter((c) => c.verdict === "INVALID")
      .length;
    const validUnpushed = comments.filter(
      (c) => c.verdict === "VALID" && c.fixReplyReady,
    ).length;

    if (invalidUnpushed > 0) {
      items.push({
        id: `invalid-${s.id}`,
        kind: "invalid_unpushed",
        projectPath: s.projectPath,
        projectId: s.projectId,
        mrIid: s.mrIid,
        mrTitle: s.mrTitle,
        sourceBranch: s.sourceBranch,
        gitlabHost: s.gitlabHost,
        sessionId: s.id,
        status: s.status,
        invalidUnpushed,
        updatedAt: s.updatedAt.toISOString(),
        reason: `${invalidUnpushed} reply INVALID chưa push`,
      });
    }
    if (validUnpushed > 0) {
      items.push({
        id: `valid-${s.id}`,
        kind: "valid_unpushed",
        projectPath: s.projectPath,
        projectId: s.projectId,
        mrIid: s.mrIid,
        mrTitle: s.mrTitle,
        sourceBranch: s.sourceBranch,
        gitlabHost: s.gitlabHost,
        sessionId: s.id,
        status: s.status,
        validUnpushed,
        updatedAt: s.updatedAt.toISOString(),
        reason: `${validUnpushed} reply VALID sẵn sàng chưa push`,
      });
    }
  }

  return items;
}

async function loadLocalItems(userId: string) {
  const sessionSelect = {
    id: true,
    projectPath: true,
    projectId: true,
    mrIid: true,
    mrTitle: true,
    sourceBranch: true,
    gitlabHost: true,
    status: true,
    updatedAt: true,
  } as const;

  const [activeSessions, completedSessions] = await Promise.all([
    prisma.reviewSession.findMany({
      where: {
        userId,
        status: { in: ["validating", "failed", "pending"] },
      },
      orderBy: { updatedAt: "desc" },
      take: SESSION_LIMIT,
      select: sessionSelect,
    }),
    prisma.reviewSession.findMany({
      where: {
        userId,
        status: "completed",
        commentResults: {
          some: {
            pushedToGitlab: false,
            OR: [
              { verdict: "INVALID" },
              { verdict: "VALID", fixReplyReady: true },
            ],
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: SESSION_LIMIT,
      select: {
        ...sessionSelect,
        commentResults: {
          where: {
            pushedToGitlab: false,
            OR: [
              { verdict: "INVALID" },
              { verdict: "VALID", fixReplyReady: true },
            ],
          },
          select: {
            verdict: true,
            fixReplyReady: true,
          },
        },
      },
    }),
  ]);

  // Gộp, ưu tiên updatedAt mới; tránh trùng session id
  const byId = new Map<string, (typeof activeSessions)[number] | (typeof completedSessions)[number]>();
  for (const s of [...activeSessions, ...completedSessions]) {
    const prev = byId.get(s.id);
    if (!prev || s.updatedAt > prev.updatedAt) byId.set(s.id, s);
  }

  const sessions = [...byId.values()]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, SESSION_LIMIT);

  return buildSessionItems(sessions);
}

async function loadOpenMrs(
  userId: string,
  excludeKeys: Set<string>,
): Promise<AttentionItem[]> {
  const connection = await prisma.gitlabConnection.findFirst({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    select: { host: true, tokenEncrypted: true },
  });
  if (!connection) return [];

  try {
    const token = decrypt(connection.tokenEncrypted);
    // Không gọi Projects.show / Discussions.all — chỉ list MR mở (nhanh)
    const mrs = await listOpenAuthoredMergeRequestsFast(
      connection.host,
      token,
      OPEN_MR_LIMIT,
    );

    const openMrs: AttentionItem[] = [];
    for (const mr of mrs) {
      const key = `${mr.projectId}:${mr.iid}`;
      if (excludeKeys.has(key)) continue;

      openMrs.push({
        id: `open-${mr.projectId}-${mr.iid}`,
        kind: "open_mr",
        projectPath: mr.projectPath,
        projectId: mr.projectId,
        mrIid: mr.iid,
        mrTitle: mr.title,
        sourceBranch: mr.sourceBranch,
        gitlabHost: connection.host,
        unresolvedCount: null,
        updatedAt: mr.updatedAt,
        webUrl: mr.webUrl,
        reason: excludeKeys.has(key)
          ? "MR mở"
          : "MR mở — chưa có phiên cần xử lý trong app",
      });
    }
    return openMrs;
  } catch (error) {
    console.error("[attention] list open MRs failed:", error);
    return [];
  }
}

/**
 * ?source=local (mặc định) — chỉ DB, load nhanh khi vào dashboard.
 * ?source=gitlab — thêm vài MR mở từ GitLab (không đếm discussion).
 * ?source=all — local + gitlab.
 */
export async function GET(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? "local";
  const includeGitlab = source === "gitlab" || source === "all";
  const includeLocal = source !== "gitlab";

  const userId = authResult.userId;

  let items: AttentionItem[] = [];
  if (includeLocal) {
    items = await loadLocalItems(userId);
  }

  let openMrs: AttentionItem[] = [];
  if (includeGitlab) {
    const excludeKeys = new Set(
      items.map((i) => `${i.projectId ?? ""}:${i.mrIid}`),
    );
    openMrs = await loadOpenMrs(userId, excludeKeys);
  }

  const merged = [...items, ...openMrs]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, RESULT_LIMIT);

  return NextResponse.json({
    items: merged,
    source,
    counts: {
      invalidUnpushed: items.filter((i) => i.kind === "invalid_unpushed").length,
      validUnpushed: items.filter((i) => i.kind === "valid_unpushed").length,
      validating: items.filter((i) => i.kind === "validating").length,
      failed: items.filter((i) => i.kind === "failed").length,
      openMr: openMrs.length,
      total: merged.length,
    },
  });
}
