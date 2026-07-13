/**
 * Đánh giá model AI theo thang 1–5 sao.
 * - capability: sức mạnh sẵn có theo tên model (curated heuristics)
 * - performance: hiệu suất thực tế từ dữ liệu review của user
 */

export type StarScore = 1 | 2 | 3 | 4 | 5;

export interface ModelCapabilityRating {
  stars: StarScore;
  label: string;
  reason: string;
}

export interface ProviderPerformanceInput {
  providerId: string;
  provider: string;
  model: string | null;
  sessionCount: number;
  completedSessions: number;
  commentCount: number;
  avgConfidence: number | null;
  tokensUsedInPeriod: number;
}

export interface ProviderRating {
  providerId: string;
  provider: string;
  model: string | null;
  capabilityStars: StarScore;
  performanceStars: StarScore | null;
  overallStars: StarScore;
  label: string;
  reason: string;
  sampleSize: number;
  avgConfidence: number | null;
  sessionCount: number;
  completedRate: number | null;
}

const STAR_LABELS: Record<StarScore, string> = {
  1: "Yếu",
  2: "Cơ bản",
  3: "Khá",
  4: "Mạnh",
  5: "Rất mạnh",
};

function clampStars(n: number): StarScore {
  const rounded = Math.round(n);
  if (rounded <= 1) return 1;
  if (rounded >= 5) return 5;
  return rounded as StarScore;
}

/** Heuristic sức mạnh model theo tên phổ biến */
export function rateModelCapability(
  provider: string,
  model: string | null | undefined,
): ModelCapabilityRating {
  const m = (model ?? "").toLowerCase();
  const p = provider.toLowerCase();

  // Tier 5 — frontier / reasoning mạnh
  if (
    /opus|o3(?!-mini)|gpt-4\.1(?!-mini)|gemini-2\.5-pro|deepseek-reasoner|claude-opus|grok-3/.test(
      m,
    )
  ) {
    return {
      stars: 5,
      label: STAR_LABELS[5],
      reason: "Model frontier / reasoning cao cấp",
    };
  }

  // Tier 4 — mạnh, phù hợp review code phức tạp
  if (
    /sonnet|gpt-4o(?!-mini)|gpt-4\.1-mini|o3-mini|llama-3\.3-70|70b|mistral-large|codestral|grok-2|claude-sonnet-4|qwen2?\.?5?-72|gpt-oss-120/.test(
      m,
    )
  ) {
    return {
      stars: 4,
      label: STAR_LABELS[4],
      reason: "Model mạnh, tốt cho review & lý luận",
    };
  }

  // Tier 2 — nhẹ / tốc độ cao, độ sâu hạn chế
  if (
    /(^|[/-])(8b|9b)([/-]|$)|flash-lite|instant|nemo|haiku|mistral-small|gemma2?-9|llama3\.2(?!\d)|mini\b/.test(
      m,
    )
  ) {
    return {
      stars: 2,
      label: STAR_LABELS[2],
      reason: "Model nhẹ — nhanh nhưng kém sâu hơn",
    };
  }

  // Tier 3 — cân bằng
  if (m.length > 0) {
    return {
      stars: 3,
      label: STAR_LABELS[3],
      reason: "Model cân bằng tốc độ / chất lượng",
    };
  }

  // Fallback theo provider
  if (p === "anthropic" || p === "openai" || p === "gemini") {
    return {
      stars: 3,
      label: STAR_LABELS[3],
      reason: "Provider mạnh — model chưa nhận diện chi tiết",
    };
  }
  if (p === "ollama") {
    return {
      stars: 2,
      label: STAR_LABELS[2],
      reason: "Local model — phụ thuộc máy & bản cài",
    };
  }

  return {
    stars: 3,
    label: STAR_LABELS[3],
    reason: "Chưa có đủ tín hiệu — mặc định mức khá",
  };
}

function rateFromPerformance(input: ProviderPerformanceInput): StarScore | null {
  if (input.commentCount < 3 && input.sessionCount < 2) {
    return null; // chưa đủ mẫu
  }

  const confidence = input.avgConfidence ?? 0.55;
  // confidence thường 0–1 → map 1–5
  const confidenceStars = 1 + confidence * 4;

  const completedRate =
    input.sessionCount > 0
      ? input.completedSessions / input.sessionCount
      : 0.5;
  const completionStars = 1 + completedRate * 4;

  // Sample size bonus: nhiều dữ liệu hơn → tin cậy hơn (không đẩy quá cao)
  const sampleFactor = Math.min(1, (input.commentCount + input.sessionCount) / 20);
  const blended =
    confidenceStars * 0.55 +
    completionStars * 0.35 +
    (3 + sampleFactor * 2) * 0.1;

  return clampStars(blended);
}

export function rateProvider(input: ProviderPerformanceInput): ProviderRating {
  const capability = rateModelCapability(input.provider, input.model);
  const performanceStars = rateFromPerformance(input);
  const overallStars = performanceStars
    ? clampStars(capability.stars * 0.4 + performanceStars * 0.6)
    : capability.stars;

  const completedRate =
    input.sessionCount > 0
      ? input.completedSessions / input.sessionCount
      : null;

  let reason = capability.reason;
  if (performanceStars) {
    reason = `Kết hợp sức mạnh model (${capability.stars}★) + hiệu suất thực tế (${performanceStars}★)`;
  }

  return {
    providerId: input.providerId,
    provider: input.provider,
    model: input.model,
    capabilityStars: capability.stars,
    performanceStars,
    overallStars,
    label: STAR_LABELS[overallStars],
    reason,
    sampleSize: input.commentCount + input.sessionCount,
    avgConfidence: input.avgConfidence,
    sessionCount: input.sessionCount,
    completedRate,
  };
}

export function starLabel(stars: StarScore) {
  return STAR_LABELS[stars];
}
