import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import {
  isCommentPushable,
  pushCommentsToGitlab,
} from "@/lib/reviews/push-comments";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  sessionId: z.string(),
  commentIds: z.array(z.string()).optional(),
  pushAllInvalid: z.boolean().optional(),
  /** Push VALID đã có reply sau prompt-fix (fixReplyReady) */
  pushAllFixedValid: z.boolean().optional(),
  /** true = đẩy cả comment đã push trước đó (push lại) */
  includeAlreadyPushed: z.boolean().optional(),
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

    const includePushed = body.includeAlreadyPushed === true;

    let targets = session.commentResults.filter((c) =>
      body.commentIds?.includes(c.id),
    );

    if (body.pushAllInvalid) {
      targets = session.commentResults.filter(
        (c) =>
          c.verdict === "INVALID" && (includePushed || !c.pushedToGitlab),
      );
    } else if (body.pushAllFixedValid) {
      targets = session.commentResults.filter(
        (c) =>
          c.verdict === "VALID" &&
          c.fixReplyReady &&
          !!c.suggestedReply?.trim() &&
          (includePushed || !c.pushedToGitlab),
      );
    }

    targets = targets.filter((c) => isCommentPushable(c));

    if (targets.length === 0) {
      return NextResponse.json(
        {
          error:
            "Không có comment để push. Với VALID, chỉ push được sau khi lưu reply từ prompt fix.",
        },
        { status: 400 },
      );
    }

    const { pushedIds } = await pushCommentsToGitlab({
      userId: authResult.userId,
      sessionId: session.id,
      targets,
    });

    return NextResponse.json({
      pushedCount: pushedIds.length,
      pushedIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push thất bại";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
