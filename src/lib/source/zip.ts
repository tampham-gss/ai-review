import AdmZip from "adm-zip";

export function extractZipToMap(zipBuffer: Buffer): Map<string, string> {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const files = new Map<string, string>();

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.replace(/^[^/]+\//, "");
    if (!name || name.startsWith(".git/")) continue;
    files.set(name, entry.getData().toString("utf8"));
  }

  return files;
}

export function createZipFromMap(files: Map<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [path, content] of files.entries()) {
    zip.addFile(path, Buffer.from(content, "utf8"));
  }
  return zip.toBuffer();
}

export function mergeFixedFiles(
  base: Map<string, string>,
  fixed: Array<{ path: string; content: string }>,
): Map<string, string> {
  const merged = new Map(base);
  for (const file of fixed) {
    merged.set(file.path, file.content);
  }
  return merged;
}

function resolveFileContent(
  files: Map<string, string>,
  filePath: string,
): string | null {
  const normalized = filePath.replace(/^\//, "");
  if (files.has(normalized)) return files.get(normalized)!;
  if (files.has(filePath)) return files.get(filePath)!;

  // Match khi path trong comment có/không có prefix app/ hoặc src/
  for (const [key, value] of files.entries()) {
    if (
      key === normalized ||
      key.endsWith(`/${normalized}`) ||
      normalized.endsWith(`/${key}`) ||
      key.endsWith(normalized) ||
      normalized.endsWith(key)
    ) {
      return value;
    }
  }
  return null;
}

/**
 * Ưu tiên đoạn quanh dòng đang được review (không cắt đầu file vô nghĩa).
 */
export function getRelevantFileContent(
  files: Map<string, string>,
  filePath: string | null,
  line: number | null = null,
  contextLines = 60,
): string {
  if (!filePath) return "";

  const content = resolveFileContent(files, filePath);
  if (!content) return `[File not found: ${filePath}]`;

  const lines = content.split("\n");
  if (lines.length <= contextLines * 2) {
    return content
      .split("\n")
      .map((text, idx) => `${String(idx + 1).padStart(4, " ")}| ${text}`)
      .join("\n");
  }

  const focus = line && line > 0 ? line : Math.min(contextLines, lines.length);
  const start = Math.max(0, focus - contextLines - 1);
  const end = Math.min(lines.length, focus + contextLines);
  const slice = lines.slice(start, end);

  return [
    `// File: ${filePath} — lines ${start + 1}-${end} (focus ~${focus})`,
    ...slice.map((text, idx) => `${String(start + idx + 1).padStart(4, " ")}| ${text}`),
  ].join("\n");
}

export function buildReviewCodeContext(params: {
  files: Map<string, string>;
  filePath: string | null;
  line: number | null;
  diffText?: string | null;
  relatedSnippets?: string | null;
}): string {
  const { files, filePath, line, diffText, relatedSnippets } = params;
  const parts: string[] = [];

  if (diffText?.trim()) {
    parts.push("### MR diff (ưu tiên — code change của nhánh)\n```diff\n" + diffText.trim() + "\n```");
  }

  if (filePath) {
    const source = getRelevantFileContent(files, filePath, line);
    parts.push(
      `### Source quanh vị trí review${line ? ` (line ${line})` : ""}\n\`\`\`\n${source}\n\`\`\``,
    );
  }

  if (relatedSnippets?.trim()) {
    parts.push("### Usage / tham chiếu liên quan trong MR changes\n" + relatedSnippets.trim());
  }

  if (parts.length === 0) {
    return "Không có file đính kèm và không parse được file từ note — review general comment.";
  }

  return parts.join("\n\n");
}

/**
 * Tìm symbol (PascalCase / CONSTANT / camelCase) trong comment rồi grep
 * trong các file MR đã load — giúp AI có bằng chứng usage thực tế.
 */
export function findRelatedUsagesInFiles(
  files: Map<string, string>,
  commentBody: string,
  primaryFilePath: string | null,
  maxHits = 8,
): string {
  const symbols = new Set<string>();
  const patterns = [
    /`([A-Z][A-Z0-9_]{2,})`/g,
    /\b([A-Z][A-Z0-9_]{3,})\b/g,
    /`([A-Za-z_][A-Za-z0-9_]{2,})`/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(commentBody)) !== null) {
      const sym = match[1];
      if (
        sym &&
        !["File", "line", "AI", "TODO", "FIXME", "NOTE", "VALID", "INVALID"].includes(sym)
      ) {
        symbols.add(sym);
      }
    }
  }

  if (symbols.size === 0) return "";

  const hits: string[] = [];
  const primary = primaryFilePath?.replace(/^\//, "") ?? "";

  for (const [path, content] of files.entries()) {
    if (primary && (path === primary || path.endsWith(primary) || primary.endsWith(path))) {
      continue;
    }
    const lines = content.split("\n");
    for (const sym of symbols) {
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes(sym)) continue;
        hits.push(`- \`${path}:${i + 1}\` → \`${lines[i].trim().slice(0, 120)}\``);
        if (hits.length >= maxHits) {
          return hits.join("\n");
        }
        break;
      }
    }
  }

  return hits.join("\n");
}
