import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { parseFixReplyBlocks } from "@/lib/reviews/fix-prompt";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  sessionId: z.string(),
  /** Paste một hoặc nhiều khối reply từ Cursor/Copilot */
  pastedText: z.string().min(10).optional(),
  /** Lưu trực tiếp 1 reply cho 1 comment */
  commentId: z.string().optional(),
  reply: z.string().min(5).optional(),
});

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  try {
    const body = schema.parse(await request.json());

    const session = await prisma.reviewSession.findFirst({
      where: { id: body.sessionId, userId: authResult.userId },
      include: {
        commentResults: {
          where: { verdict: "VALID" },
          select: { id: true, suggestedReply: true },
        },
      },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const updates: Array<{ id: string; reply: string }> = [];

    if (body.commentId && body.reply) {
      const target = session.commentResults.find((c) => c.id === body.commentId);
      if (!target) {
        return NextResponse.json(
          { error: "Comment VALID không tìm thấy trong phiên" },
          { status: 404 },
        );
      }
      updates.push({ id: body.commentId, reply: body.reply.trim() });
    } else if (body.pastedText) {
      const blocks = parseFixReplyBlocks(body.pastedText);
      if (blocks.length === 0) {
        return NextResponse.json(
          { error: "Không parse được reply từ nội dung paste" },
          { status: 400 },
        );
      }

      const unusedValid = session.commentResults.filter((c) =>
        blocks.some((b) => !b.commentId) ? true : blocks.some((b) => b.commentId === c.id),
      );

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        let commentId = block.commentId;
        if (!commentId) {
          // Ghép lần lượt theo thứ tự VALID nếu thiếu ID
          commentId = unusedValid[i]?.id;
        }
        if (!commentId) continue;
        const exists = session.commentResults.some((c) => c.id === commentId);
        if (!exists) continue;
        updates.push({ id: commentId, reply: block.reply });
      }

      if (updates.length === 0) {
        return NextResponse.json(
          {
            error:
              "Không khớp được Comment ID với các review VALID. Hãy giữ dòng Comment ID trong output Cursor, hoặc paste từng comment.",
          },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "Cần pastedText hoặc (commentId + reply)" },
        { status: 400 },
      );
    }

    for (const u of updates) {
      await prisma.commentValidationResult.update({
        where: { id: u.id },
        data: {
          suggestedReply: u.reply,
          pushedToGitlab: false,
        },
      });
    }

    return NextResponse.json({
      savedCount: updates.length,
      savedIds: updates.map((u) => u.id),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Lưu reply thất bại";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
