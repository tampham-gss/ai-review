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
## #1 — \`${params.comment.id}\`

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
      `Comment ID: \`${comment.id}\``,
      buildValidFixPrompt({
        projectPath: params.projectPath,
        mrIid: params.mrIid,
        sourceBranch: params.sourceBranch,
        comment,
      }),
    ].join("\n"),
  );

  return `# Batch fix — ${params.comments.length} review VALID trên ${params.projectPath} !${params.mrIid}

Làm lần lượt từng comment. Sau khi xong **tất cả**, xuất **một file Markdown** gồm nhiều khối, mỗi khối bắt đầu bằng:

\`\`\`markdown
## #N — \`<Comment ID>\`

## Đánh giá: **...**
...
\`\`\`

Giữ đúng Comment ID trong dấu backtick. Phân tách các khối bằng \`---\`.

${parts.join("\n")}
`;
}

const CUID_RE = "[a-z][a-z0-9]{20,36}";

function cleanReplyBody(raw: string): string {
  let reply = raw.trim();
  reply = reply.replace(/^---+\s*/g, "").replace(/\s*---+\s*$/g, "").trim();
  // Bỏ header #N nếu còn sót trong body
  reply = reply.replace(
    new RegExp(`^##\\s+#\\d+\\s+[—\\-]\\s+\`(?:${CUID_RE})\`\\s*`, "i"),
    "",
  );
  reply = reply.replace(/Comment ID[^\n]*\n?/gi, "").trim();
  reply = reply.replace(/^---+\s*/g, "").replace(/\s*---+\s*$/g, "").trim();
  // Ưu tiên bắt đầu từ ## Đánh giá nếu có nội dung trước đó
  const evalIdx = reply.search(/^##\s+Đánh giá:/m);
  if (evalIdx > 0) reply = reply.slice(evalIdx).trim();
  return reply;
}

/**
 * Tách các khối reply từ output Cursor / file review-fix-responses.md.
 * Hỗ trợ:
 * - `## #1 — \`commentId\``
 * - `Comment ID: \`commentId\``
 * - Nhiều khối `## Đánh giá:` + ID gần khối
 */
export function parseFixReplyBlocks(
  pasted: string,
): Array<{ commentId: string | null; reply: string }> {
  const text = pasted.replace(/^\uFEFF/, "").trim();
  if (!text) return [];

  // Format chính: ## #1 — `cmr...`
  const numberedHeaderRe = new RegExp(
    `^##\\s+#(\\d+)\\s+[—\\-]\\s+\`(${CUID_RE})\``,
    "gim",
  );
  const numberedHeaders = [...text.matchAll(numberedHeaderRe)];
  if (numberedHeaders.length > 0) {
    const blocks: Array<{ commentId: string | null; reply: string }> = [];
    for (let i = 0; i < numberedHeaders.length; i++) {
      const match = numberedHeaders[i];
      const start = (match.index ?? 0) + match[0].length;
      const end =
        i + 1 < numberedHeaders.length
          ? (numberedHeaders[i + 1].index ?? text.length)
          : text.length;
      const reply = cleanReplyBody(text.slice(start, end));
      if (reply.length < 5) continue;
      blocks.push({ commentId: match[2], reply });
    }
    if (blocks.length > 0) return blocks;
  }

  // Format: Comment ID: `...` — tách theo ## Đánh giá hoặc theo vị trí ID
  const idLineRe = new RegExp(`Comment ID[^\\n\`]*\`(${CUID_RE})\``, "gi");
  const idMatches = [...text.matchAll(idLineRe)];
  const headingSplits = text
    .split(/(?=^##\s+Đánh giá:)/m)
    .map((s) => s.trim())
    .filter(Boolean);

  if (headingSplits.length > 1) {
    return headingSplits
      .map((block, i) => {
        const idInBlock =
          block.match(
            new RegExp(`Comment ID[^\\n\`]*\`(${CUID_RE})\``, "i"),
          )?.[1] ??
          block.match(
            new RegExp(`^##\\s+#\\d+\\s+[—\\-]\\s+\`(${CUID_RE})\``, "im"),
          )?.[1] ??
          null;
        return {
          commentId: idInBlock ?? idMatches[i]?.[1] ?? null,
          reply: cleanReplyBody(block),
        };
      })
      .filter((b) => b.reply.length >= 5);
  }

  if (idMatches.length > 1) {
    const blocks: Array<{ commentId: string | null; reply: string }> = [];
    for (let i = 0; i < idMatches.length; i++) {
      const match = idMatches[i];
      const idStart = match.index ?? 0;
      const contentStart = idStart + match[0].length;
      const nextIdStart =
        i + 1 < idMatches.length
          ? (idMatches[i + 1].index ?? text.length)
          : text.length;
      const reply = cleanReplyBody(text.slice(contentStart, nextIdStart));
      if (reply.length < 5) continue;
      blocks.push({ commentId: match[1], reply });
    }
    if (blocks.length > 0) return blocks;
  }

  const singleId =
    text.match(new RegExp(`Comment ID[^\\n\`]*\`(${CUID_RE})\``, "i"))?.[1] ??
    text.match(
      new RegExp(`^##\\s+#\\d+\\s+[—\\-]\\s+\`(${CUID_RE})\``, "im"),
    )?.[1] ??
    null;
  const reply = cleanReplyBody(text);
  if (reply.length < 5) return [];
  return [{ commentId: singleId, reply }];
}
