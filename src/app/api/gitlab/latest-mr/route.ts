import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import {
  findLatestAuthoredMergeRequest,
  listMergeRequests,
  listProjects,
} from "@/lib/gitlab/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Lấy MR opened mới nhất do user của PAT GitLab đang chọn tạo,
 * kèm danh sách projects + MRs của project đó để UI auto-fill.
 */
export async function GET(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get("connectionId");
  if (!connectionId) {
    return NextResponse.json({ error: "connectionId required" }, { status: 400 });
  }

  const connection = await prisma.gitlabConnection.findFirst({
    where: { id: connectionId, userId: authResult.userId },
  });
  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  try {
    const token = decrypt(connection.tokenEncrypted);
    const latest = await findLatestAuthoredMergeRequest(connection.host, token);

    if (!latest) {
      return NextResponse.json(
        {
          error:
            "Không tìm thấy MR opened nào do tài khoản GitLab này tạo. Hãy mở MR trước hoặc chọn connection khác.",
        },
        { status: 404 },
      );
    }

    const [projects, mergeRequests] = await Promise.all([
      listProjects(connection.host, token),
      listMergeRequests(connection.host, token, latest.projectId),
    ]);

    // Đảm bảo project của MR có trong list (membership search có thể thiếu)
    const hasProject = projects.some((p) => p.id === latest.projectId);
    const projectsWithLatest = hasProject
      ? projects
      : [
          {
            id: latest.projectId,
            name: latest.projectName || latest.pathWithNamespace,
            pathWithNamespace: latest.pathWithNamespace,
            defaultBranch: latest.targetBranch,
          },
          ...projects,
        ];

    const hasMr = mergeRequests.some((m) => m.iid === latest.iid);
    const mrsWithLatest = hasMr
      ? mergeRequests
      : [
          {
            iid: latest.iid,
            title: latest.title,
            sourceBranch: latest.sourceBranch,
            targetBranch: latest.targetBranch,
            webUrl: latest.webUrl,
          },
          ...mergeRequests,
        ];

    return NextResponse.json({
      latest,
      projects: projectsWithLatest,
      mergeRequests: mrsWithLatest,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không lấy được MR cuối";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
