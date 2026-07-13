export type Verdict = "VALID" | "INVALID" | "PARTIAL" | "NEEDS_CONTEXT";

export interface GitlabUnresolvedComment {
  discussionId: string;
  noteId: string;
  body: string;
  author: string;
  createdAt: string;
  filePath: string | null;
  line: number | null;
  severity: string | null;
  issueCategory: string | null;
  lastReplyBody: string | null;
  lastReplyAuthor: string | null;
  resolved: boolean;
}

export interface ValidationAiResult {
  verdict: Verdict;
  confidence: number;
  reasonShort: string;
  reasonDetail: string;
  suggestedReply: string;
  citedConventions: string[];
}

export interface FixAiResult {
  reply: string;
  fixedFiles: Array<{ path: string; content: string }>;
  summary: string;
}

export type { AiProviderName, AiProviderType } from "@/lib/ai/provider-registry";

export interface AiProviderConfig {
  id: string;
  provider: import("@/lib/ai/provider-registry").AiProviderName;
  apiKey: string;
  baseUrl?: string | null;
  model: string;
  tokensUsed: number;
  tokenLimit: number | null;
  isEnabled: boolean;
  priority: number;
}
