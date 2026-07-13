export type AiProviderType = "openai" | "anthropic" | "gemini" | "openai_compatible";

export type AiProviderName =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "groq"
  | "cerebras"
  | "mistral"
  | "openrouter"
  | "together"
  | "xai"
  | "ollama"
  | "azure_openai"
  | "cursor"
  | "custom";

export interface AiProviderMeta {
  id: AiProviderName;
  label: string;
  type: AiProviderType;
  defaultModel: string;
  defaultBaseUrl?: string;
  requiresBaseUrl?: boolean;
  apiKeyOptional?: boolean;
  description?: string;
  group: "popular" | "compatible" | "local" | "custom";
}

export const AI_PROVIDER_REGISTRY: AiProviderMeta[] = [
  {
    id: "openai",
    label: "OpenAI",
    type: "openai",
    defaultModel: "gpt-4o-mini",
    group: "popular",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    type: "anthropic",
    defaultModel: "claude-3-5-haiku-latest",
    group: "popular",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    type: "gemini",
    defaultModel: "gemini-2.0-flash-lite",
    description:
      "Free tier: dùng gemini-2.0-flash-lite hoặc gemini-1.5-flash. Model gemini-2.0-flash có thể limit=0 trên gói free.",
    group: "popular",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    type: "openai_compatible",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    group: "compatible",
  },
  {
    id: "groq",
    label: "Groq",
    type: "openai_compatible",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    group: "compatible",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    type: "openai_compatible",
    defaultBaseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "gpt-oss-120b",
    description:
      "Inference cực nhanh (OpenAI-compatible). Lấy API key tại https://cloud.cerebras.ai",
    group: "compatible",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    type: "openai_compatible",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    group: "compatible",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    type: "openai_compatible",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    description: "Gateway tới nhiều model (GPT, Claude, Gemini...)",
    group: "compatible",
  },
  {
    id: "together",
    label: "Together AI",
    type: "openai_compatible",
    defaultBaseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    group: "compatible",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    type: "openai_compatible",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-2-latest",
    group: "compatible",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    type: "openai_compatible",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    apiKeyOptional: true,
    description: "Chạy model local — API key có thể để trống",
    group: "local",
  },
  {
    id: "azure_openai",
    label: "Azure OpenAI",
    type: "openai_compatible",
    defaultModel: "gpt-4o-mini",
    requiresBaseUrl: true,
    description: "Nhập Azure endpoint dạng https://{resource}.openai.azure.com/openai/deployments/{deployment}",
    group: "custom",
  },
  {
    id: "cursor",
    label: "Cursor (OpenAI-compatible)",
    type: "openai_compatible",
    defaultModel: "gpt-4o",
    requiresBaseUrl: true,
    description:
      "Dùng Base URL + API key từ Cursor → Settings → Models → Override OpenAI Base URL. Cursor không có public API riêng — cần endpoint OpenAI-compatible.",
    group: "custom",
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    type: "openai_compatible",
    defaultModel: "default",
    requiresBaseUrl: true,
    description: "Bất kỳ endpoint hỗ trợ /v1/chat/completions",
    group: "custom",
  },
];

export const AI_PROVIDER_IDS = AI_PROVIDER_REGISTRY.map((p) => p.id);

export function getProviderMeta(id: string): AiProviderMeta | undefined {
  return AI_PROVIDER_REGISTRY.find((p) => p.id === id);
}

export function getDefaultModel(id: AiProviderName): string {
  return getProviderMeta(id)?.defaultModel ?? "gpt-4o-mini";
}

export function getDefaultBaseUrl(id: AiProviderName): string | undefined {
  return getProviderMeta(id)?.defaultBaseUrl;
}

export function requiresBaseUrl(id: AiProviderName): boolean {
  const meta = getProviderMeta(id);
  return meta?.requiresBaseUrl ?? meta?.type === "openai_compatible";
}

export function isApiKeyOptional(id: AiProviderName): boolean {
  return getProviderMeta(id)?.apiKeyOptional ?? false;
}

export const AI_PROVIDER_GROUPS: Record<AiProviderMeta["group"], string> = {
  popular: "Phổ biến",
  compatible: "OpenAI-compatible",
  local: "Local",
  custom: "Tùy chỉnh",
};
