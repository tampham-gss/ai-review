import { Gitlab } from "@gitbeaker/rest";
import { decrypt } from "@/lib/crypto";
import { extractZipToMap } from "@/lib/source/zip";
import {
  normalizeGitlabHost,
  parseFileLocationFromComment,
  parseMrAgentComment,
} from "@/lib/utils";
import type { GitlabUnresolvedComment } from "@/types";

export function createGitlabClient(host: string, token: string) {
  const normalizedHost = normalizeGitlabHost(host);
  return new Gitlab({
    host: normalizedHost,
    token,
  });
}

export async function testGitlabConnection(host: string, token: string) {
  const api = createGitlabClient(host, token);
  const user = await api.Users.showCurrentUser();
  return {
    username: user.username,
    name: user.name,
    host: normalizeGitlabHost(host),
  };
}

export async function listProjects(host: string, token: string, search?: string) {
  const api = createGitlabClient(host, token);
  const projects = await api.Projects.all({
    membership: true,
    search: search || undefined,
    perPage: 50,
    simple: true,
  });
  return projects.map((p) => ({
    id: String(p.id),
    name: p.name,
    pathWithNamespace: p.path_with_namespace,
    defaultBranch: p.default_branch,
  }));
}

export async function listMergeRequests(
  host: string,
  token: string,
  projectId: string,
  sourceBranch?: string,
) {
  const api = createGitlabClient(host, token);
  const mrs = await api.MergeRequests.all({
    projectId,
    state: "opened",
    sourceBranch: sourceBranch || undefined,
    perPage: 50,
  });
  return mrs.map((mr) => ({
    iid: mr.iid,
    title: mr.title,
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
    webUrl: mr.web_url,
  }));
}

export async function listBranches(host: string, token: string, projectId: string) {
  const api = createGitlabClient(host, token);
  const branches = await api.Branches.all(projectId, { perPage: 100 });
  return branches.map((b) => ({
    name: b.name,
    commit: b.commit?.id,
  }));
}

/**
 * Chỉ lấy discussion chưa resolve (bỏ qua đã resolve / system note)
 * để tránh tốn token.
 */
export async function getUnresolvedComments(
  host: string,
  token: string,
  projectId: string,
  mrIid: number,
): Promise<GitlabUnresolvedComment[]> {
  const api = createGitlabClient(host, token);
  const discussions = await api.MergeRequestDiscussions.all(projectId, mrIid);

  const results: GitlabUnresolvedComment[] = [];

  for (const discussion of discussions) {
    // Đã resolve → bỏ qua hoàn toàn
    if (discussion.resolved) continue;

    const notes = discussion.notes ?? [];
    if (notes.length === 0) continue;

    // Chỉ lấy thread có thể resolve (review comment / diff note)
    const resolvableNotes = notes.filter(
      (n) =>
        !n.system &&
        (n.resolvable === true ||
          n.type === "DiffNote" ||
          n.type === "DiscussionNote" ||
          !!n.position),
    );
    if (resolvableNotes.length === 0) continue;

    // Nếu mọi note resolvable đều đã resolved riêng lẻ → bỏ
    const stillOpen = resolvableNotes.some((n) => n.resolved !== true);
    if (!stillOpen) continue;

    const firstNote = resolvableNotes[0] ?? notes[0];
    const lastNote = notes[notes.length - 1];
    const position = firstNote.position as
      | { new_path?: string; new_line?: number; old_path?: string; old_line?: number }
      | undefined;

    let filePath = position?.new_path ?? position?.old_path ?? null;
    let line = position?.new_line ?? position?.old_line ?? null;

    // Không có đính kèm position → parse từ note text
    if (!filePath) {
      const fromBody = parseFileLocationFromComment(firstNote.body ?? "");
      filePath = fromBody.filePath;
      line = line ?? fromBody.line;
    }

    const parsed = parseMrAgentComment(firstNote.body ?? "");

    results.push({
      discussionId: discussion.id,
      noteId: String(firstNote.id),
      body: firstNote.body ?? "",
      author: firstNote.author?.name ?? firstNote.author?.username ?? "Unknown",
      createdAt: firstNote.created_at ?? new Date().toISOString(),
      filePath,
      line,
      severity: parsed.severity,
      issueCategory: parsed.issueCategory,
      lastReplyBody: notes.length > 1 ? (lastNote.body ?? null) : null,
      lastReplyAuthor:
        notes.length > 1
          ? (lastNote.author?.name ?? lastNote.author?.username ?? null)
          : null,
      resolved: false,
    });
  }

  return results;
}

export async function postDiscussionNote(
  host: string,
  token: string,
  projectId: string,
  mrIid: number,
  discussionId: string,
  body: string,
) {
  const api = createGitlabClient(host, token);
  return api.MergeRequestDiscussions.addNote(projectId, mrIid, discussionId, body);
}

export async function getMergeRequestRef(
  host: string,
  token: string,
  projectId: string,
  mrIid: number,
  fallbackBranch: string,
): Promise<string> {
  const api = createGitlabClient(host, token);
  try {
    const mr = await api.MergeRequests.show(projectId, mrIid);
    const expanded = mr as { sha?: string; diff_refs?: { head_sha?: string } };
    return expanded.sha ?? expanded.diff_refs?.head_sha ?? fallbackBranch;
  } catch {
    return fallbackBranch;
  }
}

export type MrFileChange = {
  oldPath: string | null;
  newPath: string | null;
  diff: string;
  newFile: boolean;
  deletedFile: boolean;
  renamedFile: boolean;
};

/**
 * Lấy danh sách file/diff đã change trên MR — ưu tiên làm căn cứ review.
 */
export async function getMergeRequestChanges(
  host: string,
  token: string,
  projectId: string,
  mrIid: number,
): Promise<MrFileChange[]> {
  const api = createGitlabClient(host, token);

  try {
    const changes = await api.MergeRequests.showChanges(projectId, mrIid);
    const list = (changes as { changes?: Array<Record<string, unknown>> }).changes ?? [];
    return list.map((c) => ({
      oldPath: (c.old_path as string) ?? null,
      newPath: (c.new_path as string) ?? null,
      diff: (c.diff as string) ?? "",
      newFile: Boolean(c.new_file),
      deletedFile: Boolean(c.deleted_file),
      renamedFile: Boolean(c.renamed_file),
    }));
  } catch {
    // Fallback: allDiffs nếu showChanges không khả dụng trên instance
    try {
      const diffs = await api.MergeRequests.allDiffs(projectId, mrIid);
      return (diffs as Array<Record<string, unknown>>).map((c) => ({
        oldPath: (c.old_path as string) ?? null,
        newPath: (c.new_path as string) ?? null,
        diff: (c.diff as string) ?? "",
        newFile: Boolean(c.new_file),
        deletedFile: Boolean(c.deleted_file),
        renamedFile: Boolean(c.renamed_file),
      }));
    } catch {
      return [];
    }
  }
}

export function findDiffForFile(
  changes: MrFileChange[],
  filePath: string | null,
): string | null {
  if (!filePath || changes.length === 0) return null;
  const normalized = filePath.replace(/^\//, "");

  const match = changes.find((c) => {
    const candidates = [c.newPath, c.oldPath].filter(Boolean) as string[];
    return candidates.some(
      (p) =>
        p === normalized ||
        p.endsWith(`/${normalized}`) ||
        normalized.endsWith(`/${p}`) ||
        p.endsWith(normalized) ||
        normalized.endsWith(p),
    );
  });

  return match?.diff?.trim() ? match.diff : null;
}

export async function downloadRepositoryArchive(
  host: string,
  token: string,
  projectId: string,
  ref: string,
): Promise<Buffer> {
  const api = createGitlabClient(host, token);
  const errors: string[] = [];

  // 1) GitBeaker — xử lý header/encoding đúng cho mọi GitLab instance
  try {
    const blob = await api.Repositories.showArchive(projectId, {
      fileType: "zip",
      sha: ref,
    });
    if (blob instanceof Blob) {
      return Buffer.from(await blob.arrayBuffer());
    }
    if (blob instanceof ArrayBuffer) {
      return Buffer.from(blob);
    }
    if (Buffer.isBuffer(blob)) {
      return blob;
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  // 2) Raw fetch với Accept header phù hợp (tránh 406 Not Acceptable)
  const normalizedHost = normalizeGitlabHost(host);
  const encodedProject = encodeURIComponent(projectId);
  const encodedRef = encodeURIComponent(ref);
  const urls = [
    `${normalizedHost}/api/v4/projects/${encodedProject}/repository/archive.zip?sha=${encodedRef}`,
    `${normalizedHost}/api/v4/projects/${encodedProject}/repository/archive?sha=${encodedRef}&format=zip`,
    `${normalizedHost}/api/v4/projects/${encodedProject}/repository/archive.tar.gz?sha=${encodedRef}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          "PRIVATE-TOKEN": token,
          Accept: "application/octet-stream, application/zip, application/x-gzip, */*",
        },
      });

      if (response.ok) {
        return Buffer.from(await response.arrayBuffer());
      }

      errors.push(`${response.status} ${response.statusText} — ${url}`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(
    `Không thể tải source từ GitLab. Thử upload ZIP thủ công. Chi tiết: ${errors[0] ?? "unknown"}`,
  );
}

export async function downloadFilesFromRepository(
  host: string,
  token: string,
  projectId: string,
  ref: string,
  filePaths: string[],
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const unique = [...new Set(filePaths.filter(Boolean))];

  for (const filePath of unique) {
    try {
      const content = await getFileContent(host, token, projectId, filePath, ref);
      files.set(filePath.replace(/^\//, ""), content);
    } catch {
      // Bỏ qua file không tồn tại
    }
  }

  return files;
}

/**
 * Ưu tiên file trong MR changes + file được comment đề cập.
 * Archive full repo chỉ là fallback khi cần.
 */
export async function downloadSourceForReview(
  host: string,
  token: string,
  projectId: string,
  ref: string,
  commentFilePaths: string[],
  changedFilePaths: string[] = [],
): Promise<{ buffer: Buffer | null; files: Map<string, string>; usedFallback: boolean }> {
  const priorityPaths = [
    ...new Set([...commentFilePaths, ...changedFilePaths].filter(Boolean)),
  ];

  if (priorityPaths.length > 0) {
    const files = await downloadFilesFromRepository(
      host,
      token,
      projectId,
      ref,
      priorityPaths,
    );
    if (files.size > 0) {
      return { buffer: null, files, usedFallback: false };
    }
  }

  try {
    const buffer = await downloadRepositoryArchive(host, token, projectId, ref);
    return { buffer, files: extractZipToMap(buffer), usedFallback: false };
  } catch {
    throw new Error(
      "Không tải được source từ GitLab. Hãy upload source ZIP thủ công.",
    );
  }
}

export async function getFileContent(
  host: string,
  token: string,
  projectId: string,
  filePath: string,
  ref: string,
): Promise<string> {
  const api = createGitlabClient(host, token);
  const file = await api.RepositoryFiles.show(projectId, filePath, ref);
  return Buffer.from(file.content, "base64").toString("utf8");
}

export function getDecryptedToken(tokenEncrypted: string): string {
  try {
    return decrypt(tokenEncrypted);
  } catch {
    return tokenEncrypted;
  }
}
