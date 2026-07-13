import type { AiProviderName } from "./provider-registry";

export interface AiModelOption {
  value: string;
  label: string;
  badge?: string;
}

export const PROVIDER_MODELS: Record<AiProviderName, AiModelOption[]> = {
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini", badge: "Khuyến nghị" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "o3-mini", label: "o3 Mini" },
  ],
  anthropic: [
    { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", badge: "Nhanh" },
    { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  ],
  gemini: [
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", badge: "Khuyến nghị" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
  deepseek: [
    { value: "deepseek-chat", label: "DeepSeek Chat", badge: "Khuyến nghị" },
    { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  ],
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", badge: "Khuyến nghị" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
    { value: "gemma2-9b-it", label: "Gemma 2 9B" },
  ],
  cerebras: [
    { value: "gpt-oss-120b", label: "GPT OSS 120B", badge: "Khuyến nghị" },
    { value: "zai-glm-4.7", label: "Z.ai GLM 4.7" },
    { value: "gemma-4-31b", label: "Gemma 4 31B" },
    { value: "llama-3.3-70b", label: "Llama 3.3 70B" },
    { value: "llama3.1-8b", label: "Llama 3.1 8B" },
    { value: "qwen-3-32b", label: "Qwen 3 32B" },
  ],
  mistral: [
    { value: "mistral-small-latest", label: "Mistral Small", badge: "Khuyến nghị" },
    { value: "mistral-large-latest", label: "Mistral Large" },
    { value: "codestral-latest", label: "Codestral" },
    { value: "open-mistral-nemo", label: "Mistral Nemo" },
  ],
  openrouter: [
    { value: "openai/gpt-4o-mini", label: "OpenAI GPT-4o Mini", badge: "Phổ biến" },
    { value: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku" },
    { value: "google/gemini-2.0-flash-lite-001", label: "Gemini 2.0 Flash Lite" },
    { value: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    { value: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
  ],
  together: [
    {
      value: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      label: "Llama 3.3 70B Instruct",
      badge: "Khuyến nghị",
    },
    { value: "Qwen/Qwen2.5-72B-Instruct-Turbo", label: "Qwen 2.5 72B" },
    { value: "mistralai/Mixtral-8x7B-Instruct-v0.1", label: "Mixtral 8x7B" },
  ],
  xai: [
    { value: "grok-2-latest", label: "Grok 2", badge: "Khuyến nghị" },
    { value: "grok-2-vision-latest", label: "Grok 2 Vision" },
    { value: "grok-beta", label: "Grok Beta" },
  ],
  ollama: [
    { value: "llama3.2", label: "Llama 3.2", badge: "Phổ biến" },
    { value: "llama3.1", label: "Llama 3.1" },
    { value: "qwen2.5", label: "Qwen 2.5" },
    { value: "deepseek-r1", label: "DeepSeek R1" },
    { value: "codellama", label: "Code Llama" },
    { value: "mistral", label: "Mistral" },
  ],
  azure_openai: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini (deployment name)" },
    { value: "gpt-4o", label: "GPT-4o (deployment name)" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini (deployment name)" },
  ],
  cursor: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
  ],
  custom: [
    { value: "default", label: "default" },
    { value: "gpt-4o-mini", label: "gpt-4o-mini" },
    { value: "gpt-4o", label: "gpt-4o" },
  ],
};

export const CUSTOM_MODEL_VALUE = "__custom__";

export function getProviderModels(provider: AiProviderName): AiModelOption[] {
  return PROVIDER_MODELS[provider] ?? [];
}

export function isKnownModel(provider: AiProviderName, model: string): boolean {
  return getProviderModels(provider).some((m) => m.value === model);
}
