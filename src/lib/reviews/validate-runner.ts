import { getConventionText } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import {
  downloadSourceForReview,
  findDiffForFile,
  getMergeRequestChanges,
  getMergeRequestRef,
  getUnresolvedComments,
  type MrFileChange,
} from "@/lib/gitlab/client";
import { findGitlabConnectionForHost } from "@/lib/gitlab/resolve-connection";
import { validateCommentWithAi } from "@/lib/ai/providers";
import { buildReviewCodeContext, extractZipToMap, findRelatedUsagesInFiles } from "@/lib/source/zip";
import type { GitlabUnresolvedComment } from "@/types";
import { z } from "zod";

export const validateBodySchema = z
  .object({
    /** Tiếp tục phiên validate đang dở (vượt timeout Vercel). */
    sessionId: z.string().optional(),
    connectionId: z.string().optional(),
    projectId: z.string().optional(),
    projectPath: z.string().optional(),
    mrIid: z.number().int().optional(),
    mrTitle: z.string().optional(),
    sourceBranch: z.string().optional(),
    selectedCategoryIds: z.array(z.string()).optional(),
    sourceType: z.enum(["gitlab", "zip"]).optional(),
    zipBase64: z.string().optional(),
    providerId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.sessionId) return;
    const required = [
      "connectionId",
      "projectId",
      "projectPath",
      "mrIid",
      "sourceBranch",
      "selectedCategoryIds",
    ] as const;
    for (const key of required) {
      if (data[key] === undefined || data[key] === null) {
        ctx.addIssue({
          code: "custom",
          message: `${key} is required`,
          path: [key],
        });
      }
    }
  });

export type ValidateBody = z.infer<typeof validateBodySchema>;

export type ValidateProgressEvent =
  | {
      type: "phase";
      phase: string;
      message: string;
      percent: number;
    }
  | {
      type: "comments_loaded";
      total: number;
      message: string;
      percent: number;
    }
  | {
      type: "validating";
      current: number;
      total: number;
      percent: number;
      comment: {
        author: string;
        filePath: string | null;
        line: number | null;
        severity: string | null;
        preview: string;
      };
      message: string;
    }
  | {
      type: "comment_done";
      current: number;
      total: number;
      percent: number;
      verdict: string;
      message: string;
    }
  | {
      type: "heartbeat";
      message: string;
      percent: number;
      current?: number;
      total?: number;
    }
  | {
      /** Hết budget thời gian (Vercel) — client gọi lại với sessionId */
      type: "need_continue";
      sessionId: string;
      current: number;
      total: number;
      remaining: number;
      percent: number;
      message: string;
    }
  | {
      type: "complete";
      sessionId: string;
      total: number;
      percent: number;
      message: string;
    }
  | {
      type: "cancelled";
      sessionId: string | null;
      message: string;
      percent: number;
    }
  | {
      type: "retry";
      current: number;
      total: number;
      attempt: number;
      maxAttempts: number;
      percent: number;
      message: string;
    }
  | {
      type: "error";
      message: string;
      current?: number;
      total?: number;
    };

export class ValidateCancelledError extends Error {
  constructor(message = "Đã dừng validate") {
    super(message);
    this.name = "ValidateCancelledError";
  }
}

/** Để dưới giới hạn Vercel: Hobby ~60s, Pro maxDuration 300s. */
function getBatchBudgetMs() {
  const raw = Number(process.env.VALIDATE_BATCH_BUDGET_MS ?? "50000");
  if (!Number.isFinite(raw) || raw < 15_000) return 50_000;
  return Math.min(raw, 280_000);
}

function assertNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new ValidateCancelledError();
  }
}

function calcPercent(step: number, totalSteps: number, base = 10, range = 90) {
  if (totalSteps <= 0) return 100;
  return Math.min(100, Math.round(base + (range * step) / totalSteps));
}

function previewText(text: string, max = 120) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}...` : cleaned;
}

export async function runValidateJob(
  userId: string,
  body: ValidateBody,
  emit: (event: ValidateProgressEvent) => void,
  signal?: AbortSignal,
) {
  let sessionId: string | null = body.sessionId ?? null;
  const budgetMs = getBatchBudgetMs();
  const startedAt = Date.now();

  const remainingBudget = () => budgetMs - (Date.now() - startedAt);

  try {
    if (body.sessionId) {
      return await continueValidateJob(userId, body.sessionId, emit, signal, {
        remainingBudget,
        startedAt,
        budgetMs,
      });
    }

    emit({
      type: "phase",
      phase: "init",
      message: "Khởi tạo quy trình validate...",
      percent: 2,
    });
    assertNotCancelled(signal);

    const connection = await prisma.gitlabConnection.findFirst({
      where: { id: body.connectionId!, userId },
    });
    if (!connection) {
      throw new Error("GitLab connection not found");
    }

    const token = decrypt(connection.tokenEncrypted);

    emit({
      type: "phase",
      phase: "fetching_comments",
      message: "Đang lấy danh sách comment chưa resolved từ GitLab...",
      percent: 8,
    });
    assertNotCancelled(signal);

    const comments = await getUnresolvedComments(
      connection.host,
      token,
      body.projectId!,
      body.mrIid!,
    );
    assertNotCancelled(signal);

    emit({
      type: "comments_loaded",
      total: comments.length,
      message:
        comments.length === 0
          ? "Không có comment unresolved — sẽ tạo phiên trống."
          : `Tìm thấy ${comments.length} comment cần validate.`,
      percent: 15,
    });

    let sourceFiles: Map<string, string>;
    let zipData: Buffer | null = null;
    let mrChanges: MrFileChange[] = [];

    emit({
      type: "phase",
      phase: "loading_mr_diff",
      message: "Đang tải MR diff (code change của nhánh)...",
      percent: 16,
    });

    mrChanges = await getMergeRequestChanges(
      connection.host,
      token,
      body.projectId!,
      body.mrIid!,
    );

    const sourceType = body.sourceType ?? "gitlab";

    if (sourceType === "zip" && body.zipBase64) {
      emit({
        type: "phase",
        phase: "loading_zip",
        message: "Đang giải nén source ZIP...",
        percent: 18,
      });
      zipData = Buffer.from(body.zipBase64, "base64");
      sourceFiles = extractZipToMap(zipData);
    } else {
      emit({
        type: "phase",
        phase: "downloading_source",
        message: "Đang tải file liên quan từ MR changes + comments...",
        percent: 18,
      });

      const ref = await getMergeRequestRef(
        connection.host,
        token,
        body.projectId!,
        body.mrIid!,
        body.sourceBranch!,
      );

      const commentFilePaths = comments
        .map((c) => c.filePath)
        .filter((p): p is string => !!p);

      const changedFilePaths = [
        ...new Set(
          mrChanges
            .flatMap((c) => [c.newPath, c.oldPath])
            .filter((p): p is string => !!p),
        ),
      ].slice(0, 50);

      const source = await downloadSourceForReview(
        connection.host,
        token,
        body.projectId!,
        ref,
        commentFilePaths,
        changedFilePaths,
      );

      sourceFiles = source.files;
      if (source.buffer) zipData = source.buffer;

      emit({
        type: "phase",
        phase: "source_ready",
        message: `Source sẵn sàng (${source.files.size} file, ${mrChanges.length} file trong MR diff).`,
        percent: 22,
      });
    }

    emit({
      type: "phase",
      phase: "loading_conventions",
      message: "Đang tải convention rules...",
      percent: 25,
    });

    const conventions = await getConventionText(
      userId,
      body.selectedCategoryIds ?? [],
    );

    assertNotCancelled(signal);

    const session = await prisma.reviewSession.create({
      data: {
        userId,
        gitlabHost: connection.host,
        projectId: body.projectId!,
        projectPath: body.projectPath!,
        mrIid: body.mrIid!,
        mrTitle: body.mrTitle,
        sourceBranch: body.sourceBranch!,
        sourceType,
        zipData: zipData ? Uint8Array.from(zipData) : undefined,
        selectedCategoryIds: body.selectedCategoryIds ?? [],
        aiProviderId: body.providerId,
        status: "validating",
      },
    });
    sessionId = session.id;

    if (comments.length === 0) {
      await prisma.reviewSession.update({
        where: { id: session.id },
        data: { status: "completed" },
      });
      emit({
        type: "complete",
        sessionId: session.id,
        total: 0,
        percent: 100,
        message: "Hoàn tất — không có comment để validate.",
      });
      return session.id;
    }

    return await processCommentBatch({
      userId,
      sessionId: session.id,
      providerId: body.providerId,
      comments,
      doneIds: new Set<string>(),
      sourceFiles,
      mrChanges,
      conventions,
      emit,
      signal,
      remainingBudget,
    });
  } catch (error) {
    if (error instanceof ValidateCancelledError || signal?.aborted) {
      if (sessionId) {
        await prisma.reviewSession
          .update({
            where: { id: sessionId },
            data: { status: "cancelled" },
          })
          .catch(() => undefined);
      }
      emit({
        type: "cancelled",
        sessionId,
        message: "Đã dừng validate theo yêu cầu.",
        percent: 0,
      });
      return sessionId;
    }

    if (sessionId) {
      await prisma.reviewSession
        .update({
          where: { id: sessionId },
          data: { status: "failed" },
        })
        .catch(() => undefined);
    }

    throw error;
  }
}

async function continueValidateJob(
  userId: string,
  sessionId: string,
  emit: (event: ValidateProgressEvent) => void,
  signal: AbortSignal | undefined,
  timing: {
    remainingBudget: () => number;
    startedAt: number;
    budgetMs: number;
  },
) {
  emit({
    type: "phase",
    phase: "resume",
    message: "Tiếp tục validate (batch tiếp theo trên server)...",
    percent: 25,
  });
  assertNotCancelled(signal);

  const session = await prisma.reviewSession.findFirst({
    where: { id: sessionId, userId },
    include: { commentResults: { select: { gitlabDiscussionId: true } } },
  });
  if (!session) {
    throw new Error("Không tìm thấy phiên validate để tiếp tục");
  }
  if (session.status === "completed") {
    emit({
      type: "complete",
      sessionId: session.id,
      total: session.commentResults.length,
      percent: 100,
      message: "Phiên đã hoàn tất trước đó.",
    });
    return session.id;
  }

  // Cho phép tiếp tục từ validating / cancelled / failed (timeout Vercel, dừng tay, lỗi tạm)
  if (!["validating", "cancelled", "failed", "pending"].includes(session.status)) {
    throw new Error(`Không thể tiếp tục phiên có status "${session.status}".`);
  }

  await prisma.reviewSession.update({
    where: { id: session.id },
    data: { status: "validating" },
  });

  const connection =
    (await findGitlabConnectionForHost(userId, session.gitlabHost)) ??
    (await prisma.gitlabConnection.findFirst({ where: { userId } }));
  if (!connection) {
    throw new Error("Không tìm thấy GitLab connection cho phiên này");
  }

  const token = decrypt(connection.tokenEncrypted);
  const comments = await getUnresolvedComments(
    connection.host,
    token,
    session.projectId,
    session.mrIid,
  );
  const doneIds = new Set(
    session.commentResults.map((c) => c.gitlabDiscussionId),
  );

  emit({
    type: "comments_loaded",
    total: comments.length,
    message: `Tiếp tục: đã xong ${doneIds.size}/${comments.length} comment.`,
    percent: calcPercent(doneIds.size, Math.max(comments.length, 1), 25, 75),
  });

  const pending = comments.filter((c) => !doneIds.has(c.discussionId));
  if (pending.length === 0) {
    await prisma.reviewSession.update({
      where: { id: session.id },
      data: { status: "completed" },
    });
    emit({
      type: "complete",
      sessionId: session.id,
      total: comments.length,
      percent: 100,
      message: `Hoàn tất validate ${comments.length} comment.`,
    });
    return session.id;
  }

  let sourceFiles: Map<string, string>;
  let mrChanges: MrFileChange[] = [];

  mrChanges = await getMergeRequestChanges(
    connection.host,
    token,
    session.projectId,
    session.mrIid,
  );

  if (session.zipData) {
    sourceFiles = extractZipToMap(Buffer.from(session.zipData));
  } else {
    const ref = await getMergeRequestRef(
      connection.host,
      token,
      session.projectId,
      session.mrIid,
      session.sourceBranch,
    );
    const commentFilePaths = comments
      .map((c) => c.filePath)
      .filter((p): p is string => !!p);
    const changedFilePaths = [
      ...new Set(
        mrChanges
          .flatMap((c) => [c.newPath, c.oldPath])
          .filter((p): p is string => !!p),
      ),
    ].slice(0, 50);
    const source = await downloadSourceForReview(
      connection.host,
      token,
      session.projectId,
      ref,
      commentFilePaths,
      changedFilePaths,
    );
    sourceFiles = source.files;
  }

  const conventions = await getConventionText(
    userId,
    session.selectedCategoryIds,
  );

  return await processCommentBatch({
    userId,
    sessionId: session.id,
    providerId: session.aiProviderId ?? undefined,
    comments,
    doneIds,
    sourceFiles,
    mrChanges,
    conventions,
    emit,
    signal,
    remainingBudget: timing.remainingBudget,
  });
}

async function processCommentBatch(params: {
  userId: string;
  sessionId: string;
  providerId?: string | null;
  comments: GitlabUnresolvedComment[];
  doneIds: Set<string>;
  sourceFiles: Map<string, string>;
  mrChanges: MrFileChange[];
  conventions: string;
  emit: (event: ValidateProgressEvent) => void;
  signal?: AbortSignal;
  remainingBudget: () => number;
}) {
  const {
    userId,
    sessionId,
    providerId,
    comments,
    doneIds,
    sourceFiles,
    mrChanges,
    conventions,
    emit,
    signal,
    remainingBudget,
  } = params;

  const total = comments.length;
  const pendingIndexes = comments
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !doneIds.has(c.discussionId));

  for (const { c: comment } of pendingIndexes) {
    assertNotCancelled(signal);

    // Giữ headroom cho AI call + emit continue (~12s tối thiểu)
    if (remainingBudget() < 12_000) {
      const remaining = comments.filter((c) => !doneIds.has(c.discussionId)).length;
      const current = doneIds.size;
      emit({
        type: "need_continue",
        sessionId,
        current,
        total,
        remaining,
        percent: calcPercent(current, total, 25, 75),
        message:
          `Tạm dừng batch (giới hạn thời gian server / Vercel). ` +
          `Đã xong ${current}/${total} — tự tiếp tục...`,
      });
      return sessionId;
    }

    const current = doneIds.size + 1;
    const percent = calcPercent(current, total, 25, 75);

    emit({
      type: "validating",
      current,
      total,
      percent,
      comment: toCommentPreview(comment),
      message: buildValidatingMessage(comment, current, total),
    });

    const diffText = findDiffForFile(mrChanges, comment.filePath);
    const relatedSnippets = findRelatedUsagesInFiles(
      sourceFiles,
      comment.body,
      comment.filePath,
    );
    const fileContent = buildReviewCodeContext({
      files: sourceFiles,
      filePath: comment.filePath,
      line: comment.line,
      diffText,
      relatedSnippets,
    });

    const timeoutMs = Math.min(90_000, Math.max(20_000, remainingBudget() - 8_000));

    let result;
    try {
      ({ result } = await validateCommentWithAi({
        userId,
        providerId: providerId ?? undefined,
        conventions,
        commentBody: comment.body,
        filePath: comment.filePath,
        fileContent,
        severity: comment.severity,
        line: comment.line,
        hasMrDiff: !!diffText,
        signal,
        timeoutMs,
        onRetry: (info) => {
          emit({
            type: "retry",
            current,
            total,
            attempt: info.attempt,
            maxAttempts: info.maxAttempts,
            percent,
            message:
              `Comment ${current}/${total}: ${info.reason} ` +
              `(thử lại ${info.attempt}/${info.maxAttempts}, chờ ${Math.ceil(info.delayMs / 1000)}s)...`,
          });
        },
      }));
    } catch (error) {
      if (error instanceof ValidateCancelledError || signal?.aborted) {
        throw error instanceof ValidateCancelledError
          ? error
          : new ValidateCancelledError();
      }
      const reason =
        error instanceof Error ? error.message : "Lỗi AI không xác định";
      throw new Error(`Dừng tại comment ${current}/${total}: ${reason}`);
    }

    assertNotCancelled(signal);

    await prisma.commentValidationResult.create({
      data: {
        sessionId,
        gitlabDiscussionId: comment.discussionId,
        gitlabNoteId: comment.noteId,
        body: comment.body,
        author: comment.author,
        filePath: comment.filePath,
        line: comment.line,
        severity: comment.severity,
        issueCategory: comment.issueCategory,
        verdict: result.verdict,
        confidence: result.confidence,
        reasonShort: result.reasonShort,
        reasonDetail: result.reasonDetail,
        suggestedReply: result.suggestedReply,
      },
    });

    doneIds.add(comment.discussionId);

    emit({
      type: "comment_done",
      current,
      total,
      percent,
      verdict: result.verdict,
      message: `Comment ${current}/${total}: ${result.verdict} — ${result.reasonShort}`,
    });
  }

  await prisma.reviewSession.update({
    where: { id: sessionId },
    data: { status: "completed" },
  });

  emit({
    type: "complete",
    sessionId,
    total,
    percent: 100,
    message: `Hoàn tất validate ${total} comment.`,
  });

  return sessionId;
}

function toCommentPreview(comment: GitlabUnresolvedComment) {
  return {
    author: comment.author,
    filePath: comment.filePath,
    line: comment.line,
    severity: comment.severity,
    preview: previewText(comment.body),
  };
}

function buildValidatingMessage(
  comment: GitlabUnresolvedComment,
  current: number,
  total: number,
) {
  const location = comment.filePath
    ? `${comment.filePath}${comment.line ? `:${comment.line}` : ""}`
    : "general comment";
  return `AI đang kiểm tra ${current}/${total} — ${comment.author} @ ${location}`;
}
