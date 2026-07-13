import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { postDiscussionNote } from "@/lib/gitlab/client";
import { formatReplyForGitlab } from "@/lib/reviews/reply-format";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  sessionId: z.string(),
  commentIds: z.array(z.string()).optional(),
  pushAllInvalid: z.boolean().optional(),
});

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  try {
    const body = schema.parse(await request.json());

    const session = await prisma.reviewSession.findFirst({
      where: { id: body.sessionId, userId: authResult.userId },
      include: { commentResults: true },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const connection = await prisma.gitlabConnection.findFirst({
      where: { userId: authResult.userId, host: session.gitlabHost },
    });
    if (!connection) {
      return NextResponse.json({ error: "GitLab connection not found" }, { status: 404 });
    }

    const token = decrypt(connection.tokenEncrypted);

    const targets = body.pushAllInvalid
      ? session.commentResults.filter(
          (c) => c.verdict === "INVALID" && !c.pushedToGitlab,
        )
      : session.commentResults.filter((c) => body.commentIds?.includes(c.id));

    if (targets.length === 0) {
      return NextResponse.json({ error: "Không có comment để push" }, { status: 400 });
    }

    const pushed = [];

    for (const comment of targets) {
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

      pushed.push(comment.id);
    }

    return NextResponse.json({ pushedCount: pushed.length, pushedIds: pushed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push thất bại";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
