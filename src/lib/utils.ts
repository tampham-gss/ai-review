import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeGitlabHost(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, "");
  if (!trimmed.startsWith("http")) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function parseMrAgentComment(body: string) {
  const severityMatch = body.match(/Mức độ:\s*(\w+)/i);
  const categoryMatch = body.match(/Nhóm vấn đề:\s*(\w+)/i);
  return {
    severity: severityMatch?.[1] ?? null,
    issueCategory: categoryMatch?.[1] ?? null,
  };
}

/**
 * Trích file/line từ note text khi discussion không đính kèm position
 * (vd: "File/line AI trả về: app/src/.../Foo.tsx:31").
 */
export function parseFileLocationFromComment(body: string): {
  filePath: string | null;
  line: number | null;
} {
  const patterns = [
    /File\s*\/\s*line[^:\n]*:\s*`?([^\s`:]+\.[a-zA-Z0-9]+):(\d+)/i,
    /File\s*\/\s*line[^:\n]*:\s*`?([^\s`:]+)`?\s*:?\s*(\d+)?/i,
    /(?:File|file)\s*:\s*`?([^\s`:]+\.[a-zA-Z0-9]+)`?(?::(\d+))?/,
    /`([^\s`]+\.(?:ts|tsx|js|jsx|vue|css|scss|json|md))`(?::(\d+))?/,
    /\b([\w./-]+\.(?:ts|tsx|js|jsx|vue|css|scss))(?::(\d+))\b/,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (!match?.[1]) continue;
    const filePath = match[1].replace(/^\/+/, "").trim();
    if (!filePath.includes("/") && !filePath.includes(".")) continue;
    const line = match[2] ? Number(match[2]) : null;
    return {
      filePath,
      line: line && Number.isFinite(line) ? line : null,
    };
  }

  return { filePath: null, line: null };
}
