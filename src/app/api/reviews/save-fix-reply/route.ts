import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { parseFixReplyBlocks } from "@/lib/reviews/fix-prompt";
import { pushCommentsToGitlab } from "@/lib/reviews/push-comments";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  sessionId: z.string(),
  /** Paste một hoặc nhiều khối reply từ Cursor/Copilot */
  pastedText: z.string().min(10).optional(),
  /** Lưu trực tiếp 1 reply cho 1 comment */
  commentId: z.string().optional(),
  reply: z.string().min(5).optional(),
  /** Mặc định true: lưu xong push ngay lên GitLab */
  pushAfterSave: z.boolean().optional().default(true),
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
        },
      },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const updates: Array<{ id: string; reply: string }> = [];
    let parsedCount = 0;
    let unmatchedIds: string[] = [];

    if (body.commentId && body.reply) {
      const target = session.commentResults.find((c) => c.id === body.commentId);
      if (!target) {
        return NextResponse.json(
          { error: "Comment VALID không tìm thấy trong phiên" },
          { status: 404 },
        );
      }
      updates.push({ id: body.commentId, reply: body.reply.trim() });
      parsedCount = 1;
    } else if (body.pastedText) {
      const blocks = parseFixReplyBlocks(body.pastedText);
      parsedCount = blocks.length;
      if (blocks.length === 0) {
        return NextResponse.json(
          { error: "Không parse được reply từ nội dung paste" },
          { status: 400 },
        );
      }

      const validById = new Map(
        session.commentResults.map((c) => [c.id, c] as const),
      );
      const usedIds = new Set<string>();
      const hasAnyId = blocks.some((b) => !!b.commentId);

      for (const block of blocks) {
        let commentId = block.commentId;

        if (commentId) {
          if (!validById.has(commentId)) {
            unmatchedIds.push(commentId);
            continue;
          }
        } else if (!hasAnyId) {
          commentId =
            session.commentResults.find((c) => !usedIds.has(c.id))?.id ?? null;
        } else {
          continue;
        }

        if (!commentId || usedIds.has(commentId)) continue;
        usedIds.add(commentId);
        updates.push({ id: commentId, reply: block.reply });
      }

      if (updates.length === 0) {
        return NextResponse.json(
          {
            error:
              unmatchedIds.length > 0
                ? `Đã tách ${blocks.length} khối nhưng không khớp Comment ID nào với review VALID trong phiên. Ví dụ ID: ${unmatchedIds.slice(0, 3).join(", ")}`
                : "Không khớp được Comment ID với các review VALID. Hãy giữ dòng ## #N — `commentId` trong file reply.",
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
          fixReplyReady: true,
          pushedToGitlab: false,
        },
      });
    }

    const savedIds = updates.map((u) => u.id);
    let pushedIds: string[] = [];
    let pushError: string | null = null;

    if (body.pushAfterSave !== false) {
      try {
        const fresh = await prisma.commentValidationResult.findMany({
          where: { id: { in: savedIds }, sessionId: session.id },
        });
        const result = await pushCommentsToGitlab({
          userId: authResult.userId,
          sessionId: session.id,
          targets: fresh,
        });
        pushedIds = result.pushedIds;
      } catch (error) {
        pushError =
          error instanceof Error
            ? error.message
            : "Đã lưu reply nhưng push GitLab thất bại";
      }
    }

    return NextResponse.json({
      savedCount: updates.length,
      savedIds,
      parsedCount,
      unmatchedCount: unmatchedIds.length,
      unmatchedIds: unmatchedIds.slice(0, 10),
      pushedCount: pushedIds.length,
      pushedIds,
      pushError,
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
