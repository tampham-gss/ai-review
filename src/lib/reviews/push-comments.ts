import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { postDiscussionNote } from "@/lib/gitlab/client";
import { findGitlabConnectionForHost } from "@/lib/gitlab/resolve-connection";
import { formatReplyForGitlab } from "@/lib/reviews/reply-format";

type PushableComment = {
  id: string;
  verdict: string | null;
  suggestedReply: string | null;
  reasonShort: string | null;
  reasonDetail: string | null;
  gitlabDiscussionId: string;
  fixReplyReady: boolean;
  pushedToGitlab: boolean;
};

/**
 * VALID chỉ push khi fixReplyReady (reply từ prompt-fix).
 * INVALID / khác: push suggestedReply như trước.
 */
export function isCommentPushable(comment: PushableComment): boolean {
  if (!comment.suggestedReply?.trim()) return false;
  if (comment.verdict === "VALID") return comment.fixReplyReady;
  return true;
}

export async function pushCommentsToGitlab(params: {
  userId: string;
  sessionId: string;
  targets: PushableComment[];
}): Promise<{ pushedIds: string[]; skippedIds: string[] }> {
  const { userId, sessionId, targets } = params;

  const session = await prisma.reviewSession.findFirst({
    where: { id: sessionId, userId },
    select: {
      id: true,
      gitlabHost: true,
      projectId: true,
      mrIid: true,
    },
  });
  if (!session) {
    throw new Error("Session not found");
  }

  const connection = await findGitlabConnectionForHost(
    userId,
    session.gitlabHost,
  );
  if (!connection) {
    throw new Error("GitLab connection not found");
  }

  const token = decrypt(connection.tokenEncrypted);
  const pushedIds: string[] = [];
  const skippedIds: string[] = [];

  for (const comment of targets) {
    if (!isCommentPushable(comment)) {
      skippedIds.push(comment.id);
      continue;
    }

    const reply = formatReplyForGitlab(
      comment.suggestedReply,
      comment.verdict,
      comment.reasonShort,
      comment.reasonDetail,
    );

    await postDiscussionNote(
      session.gitlabHost,
      token,
      session.projectId,
      session.mrIid,
      comment.gitlabDiscussionId,
      reply,
    );

    await prisma.commentValidationResult.update({
      where: { id: comment.id },
      data: { pushedToGitlab: true },
    });

    pushedIds.push(comment.id);
  }

  return { pushedIds, skippedIds };
}
