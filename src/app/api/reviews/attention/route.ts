import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import {
  countUnresolvedDiscussions,
  listOpenAuthoredMergeRequests,
} from "@/lib/gitlab/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

/** MR / phiên cần xử lý: chưa push, đang validate, failed, hoặc MR mở có comment chưa resolve. */
export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const userId = authResult.userId;
  const items: AttentionItem[] = [];

  const sessions = await prisma.reviewSession.findMany({
    where: {
      userId,
      OR: [
        { status: { in: ["validating", "failed", "pending"] } },
        {
          status: "completed",
          commentResults: {
            some: {
              pushedToGitlab: false,
              verdict: { in: ["INVALID", "VALID"] },
            },
          },
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
    include: {
      commentResults: {
        select: {
          verdict: true,
          pushedToGitlab: true,
          fixReplyReady: true,
        },
      },
    },
  });

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

    const invalidUnpushed = s.commentResults.filter(
      (c) => c.verdict === "INVALID" && !c.pushedToGitlab,
    ).length;
    const validUnpushed = s.commentResults.filter(
      (c) =>
        c.verdict === "VALID" &&
        !c.pushedToGitlab &&
        c.fixReplyReady,
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

  // MR mở trên GitLab (của PAT) có discussion chưa resolve
  const connection = await prisma.gitlabConnection.findFirst({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });

  let openMrs: AttentionItem[] = [];
  if (connection) {
    try {
      const token = decrypt(connection.tokenEncrypted);
      const mrs = await listOpenAuthoredMergeRequests(
        connection.host,
        token,
        12,
      );

      const recentKeys = new Set(
        sessions.map((s) => `${s.projectId}:${s.mrIid}`),
      );

      for (const mr of mrs) {
        let unresolved: number | null = null;
        try {
          unresolved = await countUnresolvedDiscussions(
            connection.host,
            token,
            mr.projectId,
            mr.iid,
          );
        } catch {
          unresolved = null;
        }

        if (unresolved === 0) continue;

        const key = `${mr.projectId}:${mr.iid}`;
        const alreadyListed = items.some(
          (i) => i.projectId === mr.projectId && i.mrIid === mr.iid,
        );
        if (alreadyListed) continue;

        openMrs.push({
          id: `open-${mr.projectId}-${mr.iid}`,
          kind: "open_mr",
          projectPath: mr.projectPath,
          projectId: mr.projectId,
          mrIid: mr.iid,
          mrTitle: mr.title,
          sourceBranch: mr.sourceBranch,
          gitlabHost: connection.host,
          unresolvedCount: unresolved,
          updatedAt: mr.updatedAt,
          webUrl: mr.webUrl,
          reason:
            unresolved != null
              ? `${unresolved} discussion chưa resolve${
                  recentKeys.has(key) ? "" : " — chưa validate gần đây"
                }`
              : "MR mở — cần kiểm tra comment",
        });
      }
    } catch (error) {
      console.error("[attention] list open MRs failed:", error);
    }
  }

  const merged = [...items, ...openMrs].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return NextResponse.json({
    items: merged.slice(0, 50),
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
