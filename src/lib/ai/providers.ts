import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import {
  getDefaultBaseUrl,
  getDefaultModel,
  getProviderMeta,
  isApiKeyOptional,
  requiresBaseUrl,
  type AiProviderName,
} from "@/lib/ai/provider-registry";
import type {
  AiProviderConfig,
  FixAiResult,
  ValidationAiResult,
} from "@/types";

export { getDefaultModel } from "@/lib/ai/provider-registry";

function resolveBaseUrl(provider: AiProviderName, baseUrl?: string | null): string {
  if (baseUrl?.trim()) return baseUrl.trim().replace(/\/+$/, "");
  const defaultUrl = getDefaultBaseUrl(provider);
  if (defaultUrl) return defaultUrl;
  throw new Error(`Provider ${provider} yêu cầu Base URL`);
}

function resolveApiKey(provider: AiProviderName, apiKey?: string): string {
  if (apiKey?.trim()) return apiKey.trim();
  if (isApiKeyOptional(provider)) return "ollama";
  throw new Error("API key là bắt buộc");
}

function resolveModel(provider: AiProviderName, model?: string | null): string {
  if (model?.trim()) return model.trim();
  return getDefaultModel(provider);
}

function sleep(ms: number, signal?: AbortSignal) {
  if (!signal) return new Promise<void>((resolve) => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

const AI_REQUEST_TIMEOUT_MS = 90_000;

function createAbortError(message = "Đã hủy request AI") {
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; message?: string };
  return (
    e.name === "AbortError" ||
    e.name === "APIUserAbortError" ||
    /aborted|abort/i.test(e.message ?? "")
  );
}

function isRetryableAiError(error: unknown): boolean {
  if (isAbortError(error)) return false;
  if (isRateLimitError(error)) return true;
  const status = getErrorStatus(error);
  if (status !== null && status >= 500) return true;
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  return (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("socket") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("overloaded") ||
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("504")
  );
}

function mergeAbortSignals(
  timeoutMs: number,
  parent?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let didTimeout = false;

  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort(createAbortError(`AI timeout sau ${Math.round(timeoutMs / 1000)}s`));
  }, timeoutMs);

  const onParentAbort = () => {
    controller.abort(parent?.reason ?? createAbortError());
  };

  if (parent) {
    if (parent.aborted) onParentAbort();
    else parent.addEventListener("abort", onParentAbort, { once: true });
  }

  return {
    signal: controller.signal,
    timedOut: () => didTimeout,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

export type AiRetryInfo = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  reason: string;
};

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { status?: number; statusCode?: number };
  if (typeof e.status === "number") return e.status;
  if (typeof e.statusCode === "number") return e.statusCode;
  return null;
}

function isRateLimitError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 429) return true;
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  return (
    raw.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("quota") ||
    lower.includes("resource_exhausted")
  );
}

function formatAiError(
  error: unknown,
  provider?: AiProviderName,
  model?: string,
): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  const status = getErrorStatus(error);
  const meta = provider ? getProviderMeta(provider) : null;
  const providerLabel = meta?.label ?? provider ?? "AI";
  const modelLabel = model ?? "?";

  if (isRateLimitError(error) || status === 429) {
    if (provider === "gemini") {
      const isZeroQuota =
        /limit:\s*0\b/i.test(raw) ||
        /free_tier.*limit:\s*0/i.test(raw) ||
        lower.includes("limit: 0");

      if (isZeroQuota) {
        return (
          `Gemini: project/API key đang có free-tier quota = 0 cho model "${modelLabel}". ` +
          `Đổi model sẽ KHÔNG hết lỗi này. Cách xử lý: ` +
          `(1) Vào https://aistudio.google.com/apikey tạo API key từ project khác, hoặc ` +
          `(2) Bật Billing cho Google Cloud project (vẫn có free tier sau khi link billing), ` +
          `(3) Kiểm tra quota tại https://ai.dev/rate-limit.`
        );
      }

      return (
        `Gemini hết quota/rate limit cho model "${modelLabel}". ` +
        `Đợi vài phút rồi thử lại, hoặc dùng model khác (vd. gemini-2.5-flash-lite).`
      );
    }

    if (provider === "cerebras") {
      return (
        `Cerebras rate limit (HTTP 429) cho model "${modelLabel}". ` +
        `Free tier thường giới hạn số request/phút — review nhiều comment sẽ dễ bị chặn. ` +
        `Cách xử lý: (1) Đợi 30–60 giây rồi chạy lại, ` +
        `(2) Giảm tốc bằng cách đổi sang provider khác (OpenAI/Claude/Gemini), ` +
        `(3) Kiểm tra quota tại https://cloud.cerebras.ai. ` +
        `Chi tiết gốc: ${raw.slice(0, 120)}`
      );
    }

    if (provider === "groq") {
      return (
        `Groq rate limit (HTTP 429) cho model "${modelLabel}". ` +
        `Đợi khoảng 1 phút rồi thử lại, hoặc đổi provider khác. ` +
        `Chi tiết: ${raw.slice(0, 120)}`
      );
    }

    return (
      `${providerLabel} rate limit / hết quota (HTTP 429) cho model "${modelLabel}". ` +
      `Đợi vài phút rồi thử lại, hoặc đổi model/provider. ` +
      `Chi tiết: ${raw.slice(0, 140)}`
    );
  }

  if (
    status === 403 ||
    raw.includes("403") ||
    lower.includes("permission_denied") ||
    lower.includes("has been denied access")
  ) {
    if (provider === "gemini") {
      return (
        `Gemini từ chối truy cập (403) model "${modelLabel}". ` +
        `Project có thể bị hạn chế vùng/tài khoản. Tạo API key mới tại https://aistudio.google.com/apikey ` +
        `hoặc bật billing.`
      );
    }
    return `${providerLabel}: API key không hợp lệ hoặc không có quyền truy cập (403).`;
  }

  if (
    status === 401 ||
    raw.includes("401") ||
    lower.includes("invalid api key") ||
    lower.includes("incorrect api key") ||
    lower.includes("api key not valid")
  ) {
    return `${providerLabel}: API key không hợp lệ hoặc không có quyền truy cập (401).`;
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("etimedout")
  ) {
    return (
      `${providerLabel} không phản hồi kịp (timeout) với model "${modelLabel}". ` +
      `Model có thể đang quá tải / mạng bị ngắt. Hãy thử lại hoặc đổi provider.`
    );
  }

  if (
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("socket hang up")
  ) {
    return (
      `${providerLabel}: mất kết nối mạng tới API (model "${modelLabel}"). ` +
      `Kiểm tra mạng / VPN rồi chạy lại.`
    );
  }

  if (
    (raw.includes("404") && lower.includes("model")) ||
    lower.includes("is not found") ||
    lower.includes("not found for api version")
  ) {
    if (provider === "gemini") {
      return (
        `Model "${modelLabel}" không tồn tại hoặc đã bị Google shutdown. ` +
        `Thử: gemini-2.5-flash-lite / gemini-2.5-flash / gemini-2.5-pro.`
      );
    }
    return `${providerLabel}: model "${modelLabel}" không tồn tại hoặc không khả dụng.`;
  }

  if (status === 400 || raw.includes("400")) {
    return (
      `${providerLabel} từ chối request (400) với model "${modelLabel}". ` +
      `Có thể model không hỗ trợ JSON mode / tham số hiện tại. Chi tiết: ${raw.slice(0, 180)}`
    );
  }

  if (raw.length > 280) {
    const geminiPart = raw.split("[GoogleGenerativeAI Error]:")[1]?.trim();
    if (geminiPart) {
      const geminiStatus = geminiPart.match(/\[(\d{3}[^\]]*)\]/)?.[1];
      return geminiStatus
        ? `Lỗi Gemini [${geminiStatus}]: ${geminiPart.slice(0, 160)}...`
        : geminiPart.slice(0, 220);
    }
    return `${providerLabel}: ${raw.slice(0, 200)}...`;
  }

  // Làm rõ các message kiểu "429 status code (no body)"
  if (/^\d{3}\s+status code/i.test(raw)) {
    return `${providerLabel} lỗi HTTP: ${raw} (model: ${modelLabel})`;
  }

  return `${providerLabel}: ${raw}`;
}

export async function testAiConnection(params: {
  provider: AiProviderName;
  apiKey?: string;
  baseUrl?: string | null;
  model?: string;
}): Promise<{ ok: true; model: string; message: string }> {
  const meta = getProviderMeta(params.provider);
  if (!meta) throw new Error("Provider không hợp lệ");

  const model = resolveModel(params.provider, params.model);
  const apiKey = resolveApiKey(params.provider, params.apiKey);

  if (requiresBaseUrl(params.provider) && !params.baseUrl && !meta.defaultBaseUrl) {
    throw new Error(`Provider ${meta.label} yêu cầu Base URL`);
  }

  try {
    switch (meta.type) {
      case "openai":
      case "openai_compatible": {
        const client = new OpenAI({
          apiKey,
          baseURL:
            meta.type === "openai_compatible"
              ? resolveBaseUrl(params.provider, params.baseUrl)
              : undefined,
        });
        await client.chat.completions.create({
          model,
          max_tokens: 5,
          messages: [{ role: "user", content: "ping" }],
        });
        break;
      }
      case "anthropic": {
        const client = new Anthropic({ apiKey });
        await client.messages.create({
          model,
          max_tokens: 5,
          messages: [{ role: "user", content: "ping" }],
        });
        break;
      }
      default:
        throw new Error(`Provider không hỗ trợ: ${params.provider}`);
    }

    return {
      ok: true,
      model,
      message: `Kết nối ${meta.label} thành công (model: ${model})`,
    };
  } catch (error) {
    throw new Error(formatAiError(error, params.provider, model));
  }
}

export async function getUserAiProviders(userId: string): Promise<AiProviderConfig[]> {
  const providers = await prisma.aiProvider.findMany({
    where: { userId, isEnabled: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  return providers.map((p) => ({
    id: p.id,
    provider: p.provider as AiProviderName,
    apiKey: decrypt(p.apiKeyEncrypted),
    baseUrl:
      p.baseUrl ?? getDefaultBaseUrl(p.provider as AiProviderName) ?? null,
    model: p.model ?? getDefaultModel(p.provider as AiProviderName),
    tokensUsed: p.tokensUsed,
    tokenLimit: p.tokenLimit,
    isEnabled: p.isEnabled,
    priority: p.priority,
  }));
}

export async function recordTokenUsage(
  providerId: string,
  tokens: number,
  action: "validate" | "fix" = "validate",
) {
  const provider = await prisma.aiProvider.update({
    where: { id: providerId },
    data: { tokensUsed: { increment: tokens } },
  });

  if (tokens > 0) {
    await prisma.tokenUsageLog.create({
      data: {
        userId: provider.userId,
        providerId,
        tokens,
        action,
      },
    });
  }
}

function isProviderExhausted(provider: AiProviderConfig): boolean {
  if (!provider.tokenLimit) return false;
  return provider.tokensUsed >= provider.tokenLimit;
}

export function selectProvider(
  providers: AiProviderConfig[],
  preferredId?: string,
): AiProviderConfig | null {
  if (preferredId) {
    const preferred = providers.find((p) => p.id === preferredId);
    if (preferred && !isProviderExhausted(preferred)) return preferred;
  }

  return providers.find((p) => !isProviderExhausted(p)) ?? null;
}

async function callOpenAI(
  provider: AiProviderConfig,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<{ text: string; tokens: number }> {
  const meta = getProviderMeta(provider.provider);
  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL:
      meta?.type === "openai_compatible"
        ? resolveBaseUrl(provider.provider, provider.baseUrl)
        : undefined,
  });
  const response = await client.chat.completions.create(
    {
      model: provider.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
    },
    { signal },
  );

  const text = response.choices?.[0]?.message?.content ?? "{}";
  const tokens = response.usage?.total_tokens ?? 0;
  return { text, tokens };
}

async function callAnthropic(
  provider: AiProviderConfig,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<{ text: string; tokens: number }> {
  const client = new Anthropic({ apiKey: provider.apiKey });
  const response = await client.messages.create(
    {
      model: provider.model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    },
    { signal },
  );

  const text =
    response.content?.[0]?.type === "text" ? response.content[0].text : "{}";
  const tokens =
    (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
  return { text, tokens };
}

async function callAi(
  provider: AiProviderConfig,
  system: string,
  user: string,
  options?: {
    signal?: AbortSignal;
    onRetry?: (info: AiRetryInfo) => void;
    timeoutMs?: number;
  },
): Promise<{ text: string; tokens: number }> {
  const meta = getProviderMeta(provider.provider);
  if (!meta) throw new Error(`Provider không hỗ trợ: ${provider.provider}`);

  const maxAttempts = 4;
  const timeoutMs = options?.timeoutMs ?? AI_REQUEST_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (options?.signal?.aborted) {
      throw createAbortError();
    }

    const deadline = mergeAbortSignals(timeoutMs, options?.signal);
    try {
      let result: { text: string; tokens: number };
      switch (meta.type) {
        case "openai":
        case "openai_compatible":
          result = await callOpenAI(provider, system, user, deadline.signal);
          break;
        case "anthropic":
          result = await callAnthropic(provider, system, user, deadline.signal);
          break;
        default:
          throw new Error(`Provider không hỗ trợ: ${provider.provider}`);
      }

      // Pace free-tier providers khi validate hàng loạt comment
      if (provider.provider === "cerebras" || provider.provider === "groq") {
        await sleep(350, options?.signal);
      } else if (attempt === 1) {
        await sleep(120, options?.signal);
      }

      return result;
    } catch (error) {
      lastError = error;

      if (options?.signal?.aborted || (isAbortError(error) && !deadline.timedOut())) {
        throw createAbortError();
      }

      const timedOut = deadline.timedOut();
      const retryable = timedOut || isRetryableAiError(error);
      if (!retryable || attempt === maxAttempts) {
        if (timedOut) {
          throw new Error(
            formatAiError(
              new Error(`timeout sau ${Math.round(timeoutMs / 1000)}s`),
              provider.provider,
              provider.model,
            ),
          );
        }
        throw new Error(
          formatAiError(error, provider.provider, provider.model),
        );
      }

      const baseDelay =
        isRateLimitError(error) &&
        (provider.provider === "cerebras" || provider.provider === "groq")
          ? 5000
          : isRateLimitError(error)
            ? 3000
            : timedOut
              ? 2500
              : 2000;
      const delayMs = baseDelay * attempt + Math.floor(Math.random() * 500);
      const reason = timedOut
        ? "timeout — đang thử kết nối lại"
        : isRateLimitError(error)
          ? "rate limit — đang chờ rồi thử lại"
          : "lỗi mạng/API — đang thử kết nối lại";

      options?.onRetry?.({
        attempt,
        maxAttempts,
        delayMs,
        reason,
      });

      await sleep(delayMs, options?.signal);
    } finally {
      deadline.cleanup();
    }
  }

  throw new Error(
    formatAiError(lastError, provider.provider, provider.model),
  );
}

function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(cleaned) as T;
}

const GENERIC_REPLY_PATTERNS = [
  /cảm ơn bạn/i,
  /cung cấp thêm thông tin/i,
  /bạn có thể cung cấp/i,
  /để có thể đánh giá/i,
  /để đánh giá chính xác/i,
  /xin thêm/i,
  /vui lòng cung cấp/i,
  /please provide/i,
  /thank you for/i,
];

const FIX_SUGGESTION_PATTERNS = [
  /cần di chuyển/i,
  /nên di chuyển/i,
  /cập nhật import thành/i,
  /nên refactor/i,
  /cần sửa thành/i,
  /đề xuất sửa/i,
];

function hasCodeReference(text: string): boolean {
  return (
    /`[^`]+`/.test(text) ||
    /@[/\w]/.test(text) ||
    /\b(import|export|function|const|class|hook|useEffect|useCallback)\b/i.test(text) ||
    /src\//i.test(text) ||
    /\.(ts|tsx|js|jsx)/i.test(text)
  );
}

function sanitizeValidationReply(
  result: ValidationAiResult,
  fileContent: string,
): ValidationAiResult {
  let reply = (result.suggestedReply ?? "").trim();
  const isGeneric = GENERIC_REPLY_PATTERNS.some((p) => p.test(reply));
  const agreesWithReview =
    result.verdict === "INVALID" &&
    FIX_SUGGESTION_PATTERNS.some((p) => p.test(reply));
  const lacksCodeRef =
    result.verdict === "INVALID" && !hasCodeReference(reply) && reply.length > 0;
  const hasSource =
    fileContent.length > 50 &&
    !fileContent.includes("[File not found]") &&
    !fileContent.includes("Không có file đính kèm") &&
    !fileContent.includes("không parse được file");

  if (hasSource && result.verdict === "NEEDS_CONTEXT") {
    result.verdict = result.confidence > 0.5 ? "INVALID" : "PARTIAL";
  }

  const lacksStructuredMarkdown =
    result.verdict === "INVALID" &&
    reply.length > 0 &&
    !/^##\s+/m.test(reply);

  if (isGeneric || agreesWithReview || lacksCodeRef || lacksStructuredMarkdown) {
    // Nếu AI trả reasonDetail dạng markdown tốt hơn thì ưu tiên
    const fallback = result.reasonDetail || result.reasonShort || reply;
    if (lacksStructuredMarkdown && !/^##\s+/m.test(fallback)) {
      reply = [
        "## Đánh giá: **Review không đúng**",
        "",
        fallback,
        "",
        "### Kết luận",
        "",
        "Giữ nguyên code hiện tại theo phân tích trên.",
      ].join("\n");
    } else {
      reply = fallback;
    }
  }

  if (
    result.verdict === "INVALID" &&
    (!reply || GENERIC_REPLY_PATTERNS.some((p) => p.test(reply)))
  ) {
    reply = result.reasonDetail || result.reasonShort || reply;
  }

  return { ...result, suggestedReply: reply };
}

const VALIDATION_SYSTEM = `Bạn là senior developer đang review và bảo vệ code trên GitLab MR.

Nhiệm vụ: đánh giá comment review có hợp lý với SOURCE CODE / MR DIFF đã cung cấp và convention hay không.
Ưu tiên căn cứ vào MR DIFF (code change của nhánh). Source quanh dòng review dùng để kiểm chứng usage / context thực tế.

## Định nghĩa verdict
- VALID: Review ĐÚNG — code thực sự vi phạm convention hoặc có bug/vấn đề kỹ thuật.
- INVALID: Review SAI — code hiện tại đúng, reviewer hiểu nhầm convention, hoặc đề xuất không cần thiết.
- PARTIAL: Một phần đúng, một phần sai.
- NEEDS_CONTEXT: CHỈ dùng khi không có diff/source để phân tích. KHÔNG dùng khi đã có code.

## QUY TẮC suggestedReply (tiếng Việt, Markdown trực quan — đăng thẳng GitLab)

suggestedReply PHẢI là Markdown có cấu trúc rõ ràng, dễ đọc trên GitLab. KHÔNG viết đoạn văn liền một khối.

### CẤM TUYỆT ĐỐI trong suggestedReply:
- "Cảm ơn bạn đã review / yêu cầu review"
- "Bạn có thể cung cấp thêm thông tin..."
- "Để đánh giá chính xác, cần thêm context..."
- "Tôi sẽ xem xét và phản hồi sau"
- Đề xuất sửa code khi verdict = INVALID
- Prefix bot / "AI Review Audit"

### Template BẮT BUỘC (INVALID — phản bác review):

## Đánh giá: **Review không đúng — <tóm tắt ngắn quyết định>**

<1–2 câu nêu thực tế code đang làm gì / đang được dùng ở đâu>

| File | Cách dùng / bằng chứng |
|------|------------------------|
| \`FileA.tsx\` | \`code snippet hoặc pattern\` |
| \`FileB.tsx\` | \`...\` |

### Vì sao giữ nguyên / vì sao review sai

- Lý do 1 (có căn cứ code/convention)
- Lý do 2
- Lý do 3 (nếu có)

### Kết luận

<1–2 câu kết luận kiên quyết, nêu rõ giữ nguyên hay chỉ chỉnh phần nào>

### Template BẮT BUỘC (VALID — đồng ý review):

## Đánh giá: **Review đúng — <vấn đề cụ thể sẽ xử lý>**

| Vị trí | Vấn đề |
|--------|--------|
| \`path:line\` | mô tả ngắn |

### Hướng xử lý

- Bước / thay đổi dự kiến 1
- Bước 2 (nếu có)

### Kết luận

Sẽ chỉnh theo review tại vị trí nêu trên.

### Template BẮT BUỘC (PARTIAL):

## Đánh giá: **Review đúng một phần**

| Phần | Đánh giá |
|------|----------|
| ... | Đúng / Sai + lý do ngắn |

### Kết luận

...

Yêu cầu thêm:
- Dùng heading ## / ###, bảng Markdown, bullet, inline code \`...\`
- Trích dẫn CỤ THỂ: file, symbol, import, constant, pattern
- Độ dài đủ để đọc hiểu (không dưới ~8 dòng khi INVALID)

## Output JSON
{
  "verdict": "VALID" | "INVALID" | "PARTIAL" | "NEEDS_CONTEXT",
  "confidence": 0.0-1.0,
  "reasonShort": "tóm tắt ngắn (UI nội bộ)",
  "reasonDetail": "phân tích chi tiết có trích code (UI nội bộ)",
  "suggestedReply": "Markdown trực quan theo template trên — không prefix bot",
  "citedConventions": ["tên convention"]
}`;

const FIX_SYSTEM = `Bạn là senior developer. Nhiệm vụ: sửa source code theo review comment hợp lý.
Trả về JSON:
{
  "reply": "câu trả lời tiếng Việt Markdown trực quan để đăng GitLab (## Đánh giá / bảng / kết luận)",
  "summary": "tóm tắt các thay đổi",
  "fixedFiles": [{ "path": "relative/path", "content": "full file content sau khi fix" }]
}
Chỉ trả về file cần sửa. Giữ nguyên style code hiện có.
Reply dùng Markdown có heading, bảng nếu phù hợp, không prefix bot.`;

export async function validateCommentWithAi(params: {
  userId: string;
  providerId?: string;
  conventions: string;
  commentBody: string;
  filePath: string | null;
  fileContent: string;
  severity: string | null;
  line?: number | null;
  hasMrDiff?: boolean;
  signal?: AbortSignal;
  onRetry?: (info: AiRetryInfo) => void;
}): Promise<{ result: ValidationAiResult; providerId: string }> {
  const providers = await getUserAiProviders(params.userId);
  const provider = selectProvider(providers, params.providerId);
  if (!provider) {
    throw new Error("Không có AI provider khả dụng hoặc đã hết token.");
  }

  const userPrompt = `
## Convention (dùng làm căn cứ phân tích — nếu convention không hỗ trợ review thì verdict nên là INVALID)
${params.conventions}

## Review comment từ GitLab (cần đánh giá tính hợp lý)
${params.commentBody}

## Metadata
- File: ${params.filePath ?? "N/A"}
- Line: ${params.line ?? "N/A"}
- Severity: ${params.severity ?? "N/A"}
- Có MR diff: ${params.hasMrDiff ? "yes" : "no"}

## Code context (ưu tiên MR DIFF; kèm source quanh vị trí review)
${params.fileContent}

## Lưu ý BẮT BUỘC
1. Ưu tiên phân tích theo MR DIFF / code change. Source quanh line dùng để kiểm chứng usage thực tế.
2. suggestedReply PHẢI là Markdown trực quan theo template (## Đánh giá, bảng, ### Vì sao, ### Kết luận).
3. INVALID → bảo vệ code hiện tại, KHÔNG đề xuất sửa theo reviewer.
4. Cấm câu sáo rỗng: "cảm ơn", "cung cấp thêm thông tin", "để đánh giá chính xác".
5. Không prefix bot trong suggestedReply.
`;

  const { text, tokens } = await callAi(provider, VALIDATION_SYSTEM, userPrompt, {
    signal: params.signal,
    onRetry: params.onRetry,
  });
  await recordTokenUsage(provider.id, tokens, "validate");
  const parsed = parseJson<ValidationAiResult>(text);
  const result = sanitizeValidationReply(parsed, params.fileContent);
  return { result, providerId: provider.id };
}

export async function fixCommentWithAi(params: {
  userId: string;
  providerId?: string;
  conventions: string;
  commentBody: string;
  filePath: string | null;
  fileContent: string;
  allValidComments?: string;
}): Promise<{ result: FixAiResult; providerId: string }> {
  const providers = await getUserAiProviders(params.userId);
  const provider = selectProvider(providers, params.providerId);
  if (!provider) {
    throw new Error("Không có AI provider khả dụng hoặc đã hết token.");
  }

  const userPrompt = `
## Convention
${params.conventions}

## Review comment cần fix
${params.commentBody}

## Các review hợp lý khác (nếu fix tất cả)
${params.allValidComments ?? "N/A"}

## File: ${params.filePath ?? "N/A"}
\`\`\`
${params.fileContent}
\`\`\`
`;

  const { text, tokens } = await callAi(provider, FIX_SYSTEM, userPrompt);
  await recordTokenUsage(provider.id, tokens, "fix");
  const result = parseJson<FixAiResult>(text);
  return { result, providerId: provider.id };
}
