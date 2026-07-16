/**
 * Prompt để dán vào Cursor / Copilot / VS Code Chat — fix code theo review GitLab VALID.
 */

export type FixPromptComment = {
  id: string;
  body: string;
  author: string;
  filePath: string | null;
  line: number | null;
  severity: string | null;
  reasonShort: string | null;
  reasonDetail: string | null;
};

export function buildValidFixPrompt(params: {
  projectPath: string;
  mrIid: number;
  sourceBranch: string;
  comment: FixPromptComment;
}): string {
  const loc =
    params.comment.filePath != null
      ? `${params.comment.filePath}${
          params.comment.line != null ? `:${params.comment.line}` : ""
        }`
      : "(không gắn file — tìm theo nội dung review)";

  return `# GitLab MR Review — Yêu cầu FIX CODE

## Ngữ cảnh
- Project: \`${params.projectPath}\`
- Merge Request: \`!${params.mrIid}\`
- Branch: \`${params.sourceBranch}\`
- Vị trí cần sửa: \`${loc}\`
- Reviewer: ${params.comment.author}
${params.comment.severity ? `- Severity: ${params.comment.severity}` : ""}

## Comment review trên GitLab (đã đánh giá VALID — cần sửa theo review)
\`\`\`
${params.comment.body.trim()}
\`\`\`

## Phân tích từ AI Review Validator
${params.comment.reasonShort ? `- Tóm tắt: ${params.comment.reasonShort}` : ""}
${params.comment.reasonDetail ? `\n${params.comment.reasonDetail.trim()}\n` : ""}

## Nhiệm vụ của bạn (Cursor / Copilot / VS Code)
1. Mở đúng file/dòng nêu trên trong workspace hiện tại.
2. Sửa code **đúng theo yêu cầu review** — giữ style/convention hiện có, không refactor lan sang chỗ không liên quan.
3. Chỉ sửa những gì cần thiết để resolve comment này.

## Sau khi đã fix xong — BẮT BUỘC xuất khối sau (để paste lại lên web AI Review Validator)

Trả lời **CHỈ** Markdown theo template (không giải thích thêm ngoài khối này):

\`\`\`markdown
## Đánh giá: **Review đúng — đã xử lý**

| Vị trí | Thay đổi đã làm |
|--------|-----------------|
| \`${loc}\` | <mô tả ngắn thay đổi cụ thể> |

### Chi tiết đã sửa
- <thay đổi 1 — file/symbol cụ thể>
- <thay đổi 2 nếu có>

### Kết luận
Đã chỉnh theo review tại \`${loc}\`. Có thể resolve discussion trên GitLab.
\`\`\`

Comment ID (nội bộ, giữ nguyên khi paste lại web): \`${params.comment.id}\`
`;
}

export function buildBatchValidFixPrompt(params: {
  projectPath: string;
  mrIid: number;
  sourceBranch: string;
  comments: FixPromptComment[];
}): string {
  const parts = params.comments.map((comment, idx) =>
    [
      `\n---\n`,
      `## Comment VALID #${idx + 1} / ${params.comments.length}`,
      buildValidFixPrompt({
        projectPath: params.projectPath,
        mrIid: params.mrIid,
        sourceBranch: params.sourceBranch,
        comment,
      }),
    ].join("\n"),
  );

  return `# Batch fix — ${params.comments.length} review VALID trên ${params.projectPath} !${params.mrIid}

Làm lần lượt từng comment. Với **mỗi** comment, sau khi fix hãy xuất **một** khối Markdown theo template trong phần đó (kèm Comment ID).

${parts.join("\n")}
`;
}

/** Tách các khối reply từ output Cursor (có thể nhiều comment). */
export function parseFixReplyBlocks(
  pasted: string,
): Array<{ commentId: string | null; reply: string }> {
  const text = pasted.trim();
  if (!text) return [];

  const idMatches = [
    ...text.matchAll(/Comment ID[^\n`]*`([a-z0-9]+)`/gi),
  ];
  const headingSplits = text.split(/(?=^##\s+Đánh giá:)/m).filter((s) => s.trim());

  if (headingSplits.length > 1 && idMatches.length > 0) {
    return headingSplits.map((block, i) => {
      const idInBlock = block.match(/Comment ID[^\n`]*`([a-z0-9]+)`/i)?.[1] ?? null;
      const reply = block
        .replace(/Comment ID[^\n]*\n?/gi, "")
        .trim();
      return {
        commentId: idInBlock ?? idMatches[i]?.[1] ?? null,
        reply,
      };
    });
  }

  const singleId = text.match(/Comment ID[^\n`]*`([a-z0-9]+)`/i)?.[1] ?? null;
  const reply = text.replace(/Comment ID[^\n]*\n?/gi, "").trim();
  return [{ commentId: singleId, reply }];
}
