"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CommentSkeleton } from "@/components/ui/skeleton";
import { MarkdownPreview } from "@/components/ui/markdown-preview";
import { toast } from "@/components/ui/toaster";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  Clock,
  Copy,
  Download,
  History,
  MessageSquare,
  User,
  Wrench,
} from "lucide-react";

interface CommentResult {
  id: string;
  body: string;
  author: string;
  filePath: string | null;
  line: number | null;
  severity: string | null;
  verdict: string | null;
  confidence: number | null;
  reasonShort: string | null;
  reasonDetail: string | null;
  suggestedReply: string | null;
  pushedToGitlab: boolean;
}

interface Session {
  id: string;
  projectPath: string;
  mrIid: number;
  sourceBranch: string;
  sourceType: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  aiProviderId: string | null;
  aiProvider: {
    id: string;
    provider: string;
    model: string | null;
    label: string;
    isDefault: boolean;
    isEnabled: boolean;
    remaining: number | null;
  } | null;
  user?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  zipWarning: boolean;
  hasFixedSource: boolean;
  commentResults: CommentResult[];
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function verdictBadge(verdict: string | null) {
  switch (verdict) {
    case "VALID":
      return <Badge variant="valid">Hợp lý</Badge>;
    case "INVALID":
      return <Badge variant="invalid">Không hợp lý</Badge>;
    case "PARTIAL":
      return <Badge variant="partial">Một phần</Badge>;
    default:
      return <Badge>Chưa rõ</Badge>;
  }
}

export default function ReviewSessionPage() {
  const params = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [providerId, setProviderId] = useState<string | null>(null);
  const [verdictFilter, setVerdictFilter] = useState<
    "all" | "VALID" | "INVALID" | "PARTIAL" | "other"
  >("all");
  const [copiedKey, setCopiedKey] = useState("");

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews/${params.id}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Không tải được phiên review");
        setSession(null);
        return;
      }
      setSession(data.session);
      setProviderId(data.session?.aiProviderId ?? data.session?.aiProvider?.id ?? null);
    } catch {
      toast.error("Lỗi kết nối khi tải phiên review");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success("Đã copy vào clipboard");
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? "" : prev));
      }, 1500);
    } catch {
      toast.error("Không copy được — trình duyệt chặn clipboard");
    }
  }

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  async function fixComment(commentId: string) {
    setActionLoading(commentId);
    try {
      const res = await fetch("/api/reviews/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: params.id,
          commentIds: [commentId],
          providerId: providerId ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "AI fix thất bại");
        return;
      }
      toast.success("Đã AI fix comment");
      await loadSession();
    } catch {
      toast.error("Lỗi kết nối khi AI fix");
    } finally {
      setActionLoading("");
    }
  }

  async function fixAllValid() {
    setActionLoading("fix-all");
    try {
      const res = await fetch("/api/reviews/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: params.id,
          fixAllValid: true,
          providerId: providerId ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "AI fix tất cả thất bại");
        return;
      }
      toast.success("Đã AI fix tất cả comment VALID");
      await loadSession();
    } catch {
      toast.error("Lỗi kết nối khi AI fix tất cả");
    } finally {
      setActionLoading("");
    }
  }

  async function pushComment(commentId: string) {
    setActionLoading(`push-${commentId}`);
    try {
      const res = await fetch("/api/reviews/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: params.id, commentIds: [commentId] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Push thất bại");
        return;
      }
      toast.success("Đã push reply lên GitLab");
      await loadSession();
    } catch {
      toast.error("Lỗi kết nối khi push");
    } finally {
      setActionLoading("");
    }
  }

  async function pushAllInvalid() {
    setActionLoading("push-all");
    try {
      const res = await fetch("/api/reviews/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: params.id, pushAllInvalid: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Push tất cả thất bại");
        return;
      }
      toast.success("Đã push tất cả reply INVALID");
      await loadSession();
    } catch {
      toast.error("Lỗi kết nối khi push tất cả");
    } finally {
      setActionLoading("");
    }
  }

  async function pushValidReply(commentId: string) {
    setActionLoading(`push-valid-${commentId}`);
    try {
      const res = await fetch("/api/reviews/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: params.id, commentIds: [commentId] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Push reply thất bại");
        return;
      }
      toast.success("Đã push reply đã fix");
      await loadSession();
    } catch {
      toast.error("Lỗi kết nối khi push reply");
    } finally {
      setActionLoading("");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <CommentSkeleton />
        <CommentSkeleton />
        <CommentSkeleton />
      </div>
    );
  }

  if (!session) {
    return <p className="text-red-400">Không tìm thấy phiên review.</p>;
  }

  const validCount = session.commentResults.filter((c) => c.verdict === "VALID").length;
  const invalidCount = session.commentResults.filter((c) => c.verdict === "INVALID").length;
  const partialCount = session.commentResults.filter((c) => c.verdict === "PARTIAL").length;
  const otherCount = session.commentResults.filter(
    (c) => c.verdict !== "VALID" && c.verdict !== "INVALID" && c.verdict !== "PARTIAL",
  ).length;

  const filteredComments = session.commentResults.filter((c) => {
    if (verdictFilter === "all") return true;
    if (verdictFilter === "other") {
      return c.verdict !== "VALID" && c.verdict !== "INVALID" && c.verdict !== "PARTIAL";
    }
    return c.verdict === verdictFilter;
  });

  return (
    <div className="space-y-6">
      <div className="sticky top-16 z-30 -mx-1 space-y-3 border-b border-border bg-header px-1 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/reviews/history">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Lịch sử
            </Button>
          </Link>
          <Link href="/reviews">
            <Button variant="ghost" size="sm">
              <History className="h-4 w-4" />
              Review mới
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <h1
              className="truncate text-xl font-bold text-foreground sm:text-2xl"
              title={`${session.projectPath} !${session.mrIid}`}
            >
              {session.projectPath} !{session.mrIid}
            </h1>
            <p className="truncate text-sm text-muted">
              {session.sourceBranch} · {session.status}
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-soft">
              <span className="inline-flex min-w-0 items-center gap-1">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  Người tạo:{" "}
                  {session.user?.name || session.user?.email || "Không rõ"}
                </span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>Chạy lúc: {formatDateTime(session.createdAt)}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-soft">Lọc:</span>
          <button type="button" onClick={() => setVerdictFilter("all")}>
            <Badge
              className={
                verdictFilter === "all"
                  ? "ring-2 ring-white/40"
                  : "opacity-70 hover:opacity-100"
              }
            >
              Tất cả {session.commentResults.length}
            </Badge>
          </button>
          <button type="button" onClick={() => setVerdictFilter("VALID")}>
            <Badge
              variant="valid"
              className={
                verdictFilter === "VALID"
                  ? "ring-2 ring-emerald-400/50"
                  : "opacity-70 hover:opacity-100"
              }
            >
              {validCount} hợp lý
            </Badge>
          </button>
          <button type="button" onClick={() => setVerdictFilter("INVALID")}>
            <Badge
              variant="invalid"
              className={
                verdictFilter === "INVALID"
                  ? "ring-2 ring-orange-400/50"
                  : "opacity-70 hover:opacity-100"
              }
            >
              {invalidCount} không hợp lý
            </Badge>
          </button>
          {partialCount > 0 && (
            <button type="button" onClick={() => setVerdictFilter("PARTIAL")}>
              <Badge
                variant="partial"
                className={
                  verdictFilter === "PARTIAL"
                    ? "ring-2 ring-yellow-400/50"
                    : "opacity-70 hover:opacity-100"
                }
              >
                {partialCount} một phần
              </Badge>
            </button>
          )}
          {otherCount > 0 && (
            <button type="button" onClick={() => setVerdictFilter("other")}>
              <Badge
                className={
                  verdictFilter === "other"
                    ? "ring-2 ring-white/40"
                    : "opacity-70 hover:opacity-100"
                }
              >
                {otherCount} khác
              </Badge>
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {validCount > 0 && (
            <Button
              variant="success"
              size="sm"
              onClick={fixAllValid}
              loading={actionLoading === "fix-all"}
            >
              {actionLoading !== "fix-all" && <Wrench className="h-4 w-4" />}
              {actionLoading === "fix-all" ? "Đang fix..." : "AI fix tất cả VALID"}
            </Button>
          )}
          {invalidCount > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={pushAllInvalid}
              loading={actionLoading === "push-all"}
            >
              {actionLoading !== "push-all" && <MessageSquare className="h-4 w-4" />}
              {actionLoading === "push-all" ? "Đang push..." : "Push tất cả lý do INVALID"}
            </Button>
          )}
          {session.hasFixedSource && (
            <a href={`/api/reviews/${session.id}/download`}>
              <Button variant="secondary" size="sm">
                <Download className="h-4 w-4" />
                Tải source đã fix
              </Button>
            </a>
          )}
        </div>
      </div>

      {session.zipWarning && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="min-w-0 break-words">
            Phiên này dùng source ZIP upload — kết quả có thể lệch so với GitLab.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
        <Bot className="h-4 w-4 shrink-0 text-violet-400" />
        <span className="text-muted">Model AI đang chọn</span>
        <Badge variant="violet" className="max-w-full truncate font-mono text-xs">
          {session.aiProvider
            ? `${session.aiProvider.label} · ${session.aiProvider.model ?? "default"}`
            : "Chưa ghi nhận"}
        </Badge>
      </div>

      <div className="space-y-4">
        <p className="text-sm text-muted">
          Đang hiện {filteredComments.length}/{session.commentResults.length} comment
          {verdictFilter !== "all" && (
            <>
              {" "}
              ·{" "}
              <button
                type="button"
                className="text-violet-300 hover:underline"
                onClick={() => setVerdictFilter("all")}
              >
                Xóa bộ lọc
              </button>
            </>
          )}
        </p>
        {session.commentResults.length === 0 ? (
          <p className="text-sm text-muted">Không có comment unresolved trong phiên này.</p>
        ) : filteredComments.length === 0 ? (
          <p className="text-sm text-muted">
            Không có comment nào khớp bộ lọc hiện tại.
          </p>
        ) : (
          filteredComments.map((comment) => {
            const fileRef =
              comment.filePath != null
                ? `${comment.filePath}${comment.line != null ? `:${comment.line}` : ""}`
                : null;
            const pathCopied = copiedKey === `path-${comment.id}`;
            const replyCopied = copiedKey === `reply-${comment.id}`;

            return (
          <Card key={comment.id}>
            <CardHeader className="pb-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {verdictBadge(comment.verdict)}
                {comment.severity && <Badge variant="high">{comment.severity}</Badge>}
                {fileRef && (
                  <div className="flex min-w-0 max-w-full items-center gap-1">
                    <span
                      className="min-w-0 truncate font-mono text-xs text-cyan-700 dark:text-cyan-300"
                      title={fileRef}
                    >
                      {fileRef}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2"
                      title="Copy đường dẫn source"
                      onClick={() => copyText(`path-${comment.id}`, fileRef)}
                    >
                      {pathCopied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                )}
                {comment.pushedToGitlab && <Badge variant="violet">Đã push</Badge>}
              </div>
              <CardTitle className="truncate text-sm font-normal text-muted">
                {comment.author}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-48 overflow-auto rounded-xl bg-black/30 p-3">
                <MarkdownPreview
                  content={
                    comment.body.length > 2000
                      ? `${comment.body.slice(0, 2000)}\n\n...`
                      : comment.body
                  }
                  compact
                />
              </div>

              {comment.reasonShort && (
                <div className="rounded-xl border border-border bg-surface p-4">
                  <p className="break-words text-sm font-medium text-foreground">{comment.reasonShort}</p>
                  {comment.reasonDetail && (
                    <div className="mt-2">
                      <MarkdownPreview content={comment.reasonDetail} />
                    </div>
                  )}
                  {comment.confidence != null && (
                    <p className="mt-2 text-xs text-muted-soft">
                      Confidence: {Math.round(comment.confidence * 100)}%
                    </p>
                  )}
                </div>
              )}

              {comment.suggestedReply && (
                <div
                  className={`rounded-xl border p-4 ${
                    comment.verdict === "INVALID"
                      ? "border-orange-500/20 bg-orange-500/5"
                      : "border-violet-500/20 bg-violet-500/5"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p
                      className={`text-xs font-medium ${
                        comment.verdict === "INVALID" ? "text-orange-300" : "text-violet-300"
                      }`}
                    >
                      {comment.verdict === "INVALID"
                        ? "Reply phản bác — bảo vệ code hiện tại"
                        : "Reply đề xuất"}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        copyText(`reply-${comment.id}`, comment.suggestedReply!)
                      }
                    >
                      {replyCopied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {replyCopied ? "Đã copy" : "Copy reply"}
                    </Button>
                  </div>
                  <MarkdownPreview content={comment.suggestedReply} />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {comment.verdict === "VALID" && (
                  <>
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => fixComment(comment.id)}
                      loading={actionLoading === comment.id}
                    >
                      {actionLoading === comment.id ? "Đang fix..." : "AI fix comment này"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => pushValidReply(comment.id)}
                      loading={actionLoading === `push-valid-${comment.id}`}
                    >
                      {actionLoading === `push-valid-${comment.id}`
                        ? "Đang push..."
                        : "Push reply đã fix"}
                    </Button>
                  </>
                )}
                {comment.verdict === "INVALID" && !comment.pushedToGitlab && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => pushComment(comment.id)}
                    loading={actionLoading === `push-${comment.id}`}
                  >
                    {actionLoading === `push-${comment.id}`
                      ? "Đang push..."
                      : "Push lý do invalid"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
