/**
 * Chuẩn hóa reply trước khi push lên GitLab — giữ Markdown trực quan.
 */
export function formatReplyForGitlab(
  suggestedReply: string | null | undefined,
  verdict: string | null,
  reasonShort: string | null,
  reasonDetail: string | null,
): string {
  let reply = (suggestedReply ?? "").trim();

  // Gỡ prefix bot cũ nếu có trong DB
  reply = reply
    .replace(/^🤖\s*\*{0,2}AI Review Audit\*{0,2}[^\n]*\n*/gi, "")
    .replace(/\n*---\n*_Comment được tạo bởi AI Review Validator\.[^\n]*_\s*$/i, "")
    .trim();

  if (reply) {
    // Đảm bảo có heading đánh giá nếu AI quên format
    if (!/^##\s+/m.test(reply)) {
      const title =
        verdict === "VALID"
          ? "## Đánh giá: **Review đúng**"
          : verdict === "PARTIAL"
            ? "## Đánh giá: **Review đúng một phần**"
            : "## Đánh giá: **Review không đúng**";
      reply = `${title}\n\n${reply}`;
    }
    return reply;
  }

  // Fallback khi thiếu suggestedReply — vẫn theo cấu trúc trực quan
  const title =
    verdict === "VALID"
      ? "## Đánh giá: **Review đúng**"
      : verdict === "PARTIAL"
        ? "## Đánh giá: **Review đúng một phần**"
        : "## Đánh giá: **Review không đúng**";

  const body = [reasonShort, reasonDetail].filter(Boolean).join("\n\n");
  if (body) {
    return `${title}\n\n${body}\n\n### Kết luận\n\n${
      verdict === "INVALID"
        ? "Giữ nguyên code hiện tại theo phân tích trên."
        : "Sẽ xử lý theo review tại vị trí liên quan."
    }`;
  }

  return `${title}\n\nĐã xem xét comment này.`;
}
