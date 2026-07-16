"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CommentSkeleton } from "@/components/ui/skeleton";
import { MarkdownPreview } from "@/components/ui/markdown-preview";
import { toast } from "@/components/ui/toaster";
import { ContinueValidateButton } from "@/components/reviews/continue-validate-button";
import {
  PushChoiceModal,
  type PushScopeChoice,
} from "@/components/reviews/push-choice-modal";
import {
  buildBatchValidFixPrompt,
  buildValidFixPrompt,
} from "@/lib/reviews/fix-prompt";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileCode2,
  History,
  MessageSquare,
  User,
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
  /** Reply từ prompt-fix — mới được phép push GitLab (VALID). */
  fixReplyReady: boolean;
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
  const [verdictFilter, setVerdictFilter] = useState<
    "all" | "VALID" | "INVALID" | "PARTIAL" | "other"
  >("all");
  const [copiedKey, setCopiedKey] = useState("");
  const [pasteByComment, setPasteByComment] = useState<Record<string, string>>({});
  const [batchPaste, setBatchPaste] = useState("");
  const [showPromptId, setShowPromptId] = useState<string | null>(null);
  const [pushModal, setPushModal] = useState<null | "invalid">(null);

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
    if (!session) return;
    const invalids = session.commentResults.filter((c) => c.verdict === "INVALID");
    const unpushed = invalids.filter((c) => !c.pushedToGitlab).length;
    const pushed = invalids.filter((c) => c.pushedToGitlab).length;

    // Có cả đã push + chưa push → hỏi người dùng
    if (pushed > 0 && unpushed > 0) {
      setPushModal("invalid");
      return;
    }

    // Chưa từng push / hoặc toàn bộ đã push → push thẳng
    await executePushInvalid(pushed > 0 && unpushed === 0);
  }

  async function executePushInvalid(includeAlreadyPushed: boolean) {
    setActionLoading("push-all");
    try {
      const res = await fetch("/api/reviews/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: params.id,
          pushAllInvalid: true,
          includeAlreadyPushed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Push tất cả thất bại");
        return;
      }
      toast.success(
        includeAlreadyPushed
          ? `Đã push lại ${data.pushedCount ?? 0} reply INVALID`
          : `Đã push ${data.pushedCount ?? 0} reply INVALID chưa đẩy`,
      );
      setPushModal(null);
      await loadSession();
    } catch {
      toast.error("Lỗi kết nối khi push tất cả");
    } finally {
      setActionLoading("");
    }
  }

  function handlePushModalConfirm(choice: PushScopeChoice) {
    void executePushInvalid(choice === "include_pushed");
  }

  async function saveFixReply(commentId: string) {
    const pasted = pasteByComment[commentId]?.trim();
    if (!pasted) {
      toast.error("Hãy paste reply từ Cursor/Copilot vào ô bên dưới");
      return;
    }
    setActionLoading(`save-reply-${commentId}`);
    try {
      const res = await fetch("/api/reviews/save-fix-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: params.id,
          commentId,
          reply: pasted,
          pushAfterSave: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data.error === "string" ? data.error : "Lưu & push reply thất bại",
        );
        return;
      }
      if (typeof data.pushError === "string" && data.pushError) {
        toast.error(`Đã lưu reply nhưng push lỗi: ${data.pushError}`);
      } else {
        toast.success(
          `Đã lưu & push ${data.pushedCount ?? 1} reply lên GitLab`,
        );
      }
      setPasteByComment((prev) => ({ ...prev, [commentId]: "" }));
      await loadSession();
    } catch {
      toast.error("Lỗi kết nối khi lưu & push reply");
    } finally {
      setActionLoading("");
    }
  }

  async function saveBatchFixReplies() {
    if (!batchPaste.trim()) {
      toast.error("Paste toàn bộ output Cursor (có Comment ID) vào ô batch");
      return;
    }
    setActionLoading("save-batch-reply");
    try {
      const res = await fetch("/api/reviews/save-fix-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: params.id,
          pastedText: batchPaste,
          pushAfterSave: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data.error === "string" ? data.error : "Lưu & push batch thất bại",
        );
        return;
      }
      if (typeof data.pushError === "string" && data.pushError) {
        toast.error(
          `Đã lưu ${data.savedCount ?? 0} reply nhưng push lỗi: ${data.pushError}`,
        );
      } else {
        toast.success(
          `Đã lưu & push ${data.pushedCount ?? data.savedCount ?? 0} reply lên GitLab`,
        );
      }
      setBatchPaste("");
      await loadSession();
    } catch {
      toast.error("Lỗi kết nối khi lưu & push batch reply");
    } finally {
      setActionLoading("");
    }
  }

  async function retryPushValid(commentId: string) {
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
      toast.success("Đã push lại reply lên GitLab");
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

  const validComments = session.commentResults.filter((c) => c.verdict === "VALID");
  const validCount = validComments.length;
  const invalidComments = session.commentResults.filter((c) => c.verdict === "INVALID");
  const invalidCount = invalidComments.length;
  const invalidPushed = invalidComments.filter((c) => c.pushedToGitlab).length;
  const invalidUnpushed = invalidCount - invalidPushed;
  const partialCount = session.commentResults.filter((c) => c.verdict === "PARTIAL").length;
  const otherCount = session.commentResults.filter(
    (c) => c.verdict !== "VALID" && c.verdict !== "INVALID" && c.verdict !== "PARTIAL",
  ).length;
  const fixReplyComments = validComments.filter((c) => c.fixReplyReady);
  const fixReplyReady = fixReplyComments.filter((c) => !c.pushedToGitlab).length;
  const fixReplyPushed = validComments.filter((c) => c.pushedToGitlab).length;
  const validAwaitingFix = validComments.filter((c) => !c.fixReplyReady).length;
  const validUnpushed = validCount - fixReplyPushed;

  const filteredComments = session.commentResults.filter((c) => {
    if (verdictFilter === "all") return true;
    if (verdictFilter === "other") {
      return c.verdict !== "VALID" && c.verdict !== "INVALID" && c.verdict !== "PARTIAL";
    }
    return c.verdict === verdictFilter;
  });

  function fixPromptFor(comment: CommentResult) {
    return buildValidFixPrompt({
      projectPath: session!.projectPath,
      mrIid: session!.mrIid,
      sourceBranch: session!.sourceBranch,
      comment,
    });
  }

  return (
    <div className="space-y-6">
      <PushChoiceModal
        open={pushModal === "invalid"}
        title="Push INVALID lên GitLab"
        description="Phiên này vừa có comment đã push lẫn chưa push. Chọn phạm vi muốn đẩy."
        totalCount={invalidCount}
        pushedCount={invalidPushed}
        unpushedCount={invalidUnpushed}
        loading={actionLoading === "push-all"}
        onClose={() => setPushModal(null)}
        onConfirm={handlePushModalConfirm}
      />
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
              {session.commentResults.length > 0 &&
                ` · ${session.commentResults.length} comment đã có trong lịch sử`}
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
          <ContinueValidateButton
            sessionId={session.id}
            status={session.status}
            onCompleted={async () => {
              await loadSession();
              toast.success("Đã cập nhật kết quả validate mới vào phiên này");
            }}
          />
          {validCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const text = buildBatchValidFixPrompt({
                  projectPath: session.projectPath,
                  mrIid: session.mrIid,
                  sourceBranch: session.sourceBranch,
                  comments: validComments,
                });
                void copyText("batch-fix-prompt", text);
              }}
            >
              {copiedKey === "batch-fix-prompt" ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <FileCode2 className="h-4 w-4" />
              )}
              Copy prompt fix tất cả VALID
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
              {actionLoading === "push-all"
                ? "Đang push..."
                : invalidUnpushed > 0
                  ? `Push INVALID (${invalidUnpushed} còn lại)`
                  : `Push lại tất cả INVALID (${invalidCount})`}
            </Button>
          )}
        </div>
      </div>

      {(invalidCount > 0 || validCount > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {invalidCount > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-orange-500/20 bg-orange-500/10 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      Không hợp lý (INVALID)
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      Reply phản bác — đẩy lên GitLab
                    </p>
                  </div>
                </div>
                {invalidUnpushed > 0 ? (
                  <span className="shrink-0 rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Còn {invalidUnpushed} chưa đẩy
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Đã đẩy hết
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 divide-x divide-border">
                <div className="px-3 py-3 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-soft">
                    Tổng
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">
                    {invalidCount}
                  </p>
                </div>
                <div className="px-3 py-3 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    Đã đẩy
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {invalidPushed}
                  </p>
                </div>
                <div className="bg-orange-500/5 px-3 py-3 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-orange-700 dark:text-orange-300">
                    Chưa đẩy
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums text-orange-600 dark:text-orange-300">
                    {invalidUnpushed}
                  </p>
                </div>
              </div>
              <div className="border-t border-border px-3 py-2">
                <div className="mb-1 flex justify-between text-[10px] text-muted">
                  <span>Tiến độ đẩy GitLab</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {invalidCount > 0
                      ? Math.round((invalidPushed / invalidCount) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{
                      width: `${invalidCount > 0 ? (invalidPushed / invalidCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {validCount > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      Hợp lý (VALID)
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      Prompt fix → lưu &amp; push GitLab
                    </p>
                  </div>
                </div>
                {validUnpushed > 0 ? (
                  <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Còn {validUnpushed} chưa đẩy
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Đã đẩy hết
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 divide-x divide-border">
                <div className="px-3 py-3 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-soft">
                    Tổng
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">
                    {validCount}
                  </p>
                </div>
                <div className="px-3 py-3 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    Đã đẩy
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {fixReplyPushed}
                  </p>
                </div>
                <div className="bg-amber-500/5 px-3 py-3 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Chưa đẩy
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-300">
                    {validUnpushed}
                  </p>
                </div>
              </div>
              <div className="space-y-2 border-t border-border px-3 py-2">
                <div className="mb-1 flex justify-between text-[10px] text-muted">
                  <span>Tiến độ đẩy GitLab</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {validCount > 0
                      ? Math.round((fixReplyPushed / validCount) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{
                      width: `${
                        validCount > 0 ? (fixReplyPushed / validCount) * 100 : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                  <span>
                    Chờ prompt fix:{" "}
                    <strong className="text-foreground">{validAwaitingFix}</strong>
                  </span>
                  <span>
                    Đã có reply (chưa đẩy):{" "}
                    <strong className="text-foreground">{fixReplyReady}</strong>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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

      {validCount > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Prompt fix (Cursor / Copilot / VS Code)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Copy prompt fix (từng comment hoặc tất cả VALID) → dán vào chat Cursor/Copilot.
              </li>
              <li>AI sửa code trong workspace theo file/dòng + comment GitLab.</li>
              <li>
                Copy khối Markdown reply (có Comment ID) → paste vào ô bên dưới → nhấn{" "}
                <strong className="text-foreground">Đồng ý, lưu &amp; push</strong> — hệ thống
                lưu reply và đẩy lên GitLab ngay.
              </li>
            </ol>
            <Textarea
              placeholder="Paste batch output từ Cursor (nhiều khối ## Đánh giá + Comment ID)..."
              value={batchPaste}
              onChange={(e) => setBatchPaste(e.target.value)}
              className="min-h-[100px] font-mono text-xs"
            />
            <Button
              size="sm"
              variant="success"
              onClick={saveBatchFixReplies}
              loading={actionLoading === "save-batch-reply"}
              disabled={!batchPaste.trim()}
            >
              Đồng ý, lưu &amp; push (batch)
            </Button>
          </CardContent>
        </Card>
      )}

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
          <p className="text-sm text-muted">
            {session.status === "validating" ||
            session.status === "cancelled" ||
            session.status === "failed"
              ? "Chưa có comment nào trong lịch sử — nhấn Tiếp tục validate để chạy tiếp."
              : "Không có comment unresolved trong phiên này."}
          </p>
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
            const promptCopied = copiedKey === `fix-prompt-${comment.id}`;
            const promptOpen = showPromptId === comment.id;
            const promptText =
              comment.verdict === "VALID" ? fixPromptFor(comment) : "";

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
                      <p className="break-words text-sm font-medium text-foreground">
                        {comment.reasonShort}
                      </p>
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

                  {comment.verdict === "VALID" && (
                    <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          File prompt fix — dán vào Cursor / Copilot
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setShowPromptId(promptOpen ? null : comment.id)
                            }
                          >
                            <FileCode2 className="h-3.5 w-3.5" />
                            {promptOpen ? "Ẩn prompt" : "Xem prompt"}
                          </Button>
                          <Button
                            type="button"
                            variant="success"
                            size="sm"
                            onClick={() =>
                              copyText(`fix-prompt-${comment.id}`, promptText)
                            }
                          >
                            {promptCopied ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            {promptCopied ? "Đã copy" : "Copy prompt fix"}
                          </Button>
                        </div>
                      </div>
                      {promptOpen && (
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 font-mono text-[11px] text-foreground">
                          {promptText}
                        </pre>
                      )}
                      <div className="space-y-2">
                        <p className="text-xs text-muted">
                          Sau khi Cursor fix xong, paste khối Markdown reply (kèm Comment ID).
                          Nhấn nút bên dưới sẽ lưu và push lên GitLab ngay:
                        </p>
                        <Textarea
                          placeholder={`## Đánh giá: **Review đúng — đã xử lý**\n...\nComment ID: \`${comment.id}\``}
                          value={pasteByComment[comment.id] ?? ""}
                          onChange={(e) =>
                            setPasteByComment((prev) => ({
                              ...prev,
                              [comment.id]: e.target.value,
                            }))
                          }
                          className="min-h-[90px] font-mono text-xs"
                        />
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => saveFixReply(comment.id)}
                          loading={actionLoading === `save-reply-${comment.id}`}
                          disabled={!pasteByComment[comment.id]?.trim()}
                        >
                          Đồng ý, lưu &amp; push
                        </Button>
                      </div>
                    </div>
                  )}

                  {comment.suggestedReply && (
                    <div
                      className={`rounded-xl border p-4 ${
                        comment.verdict === "INVALID"
                          ? "border-orange-500/20 bg-orange-500/5"
                          : comment.fixReplyReady
                            ? "border-emerald-500/25 bg-emerald-500/5"
                            : "border-sky-500/25 bg-sky-500/5"
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p
                          className={`text-xs font-medium ${
                            comment.verdict === "INVALID"
                              ? "text-orange-700 dark:text-orange-300"
                              : comment.fixReplyReady
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-sky-700 dark:text-sky-300"
                          }`}
                        >
                          {comment.verdict === "INVALID"
                            ? "Reply phản bác — sẽ push lên GitLab"
                            : comment.fixReplyReady
                              ? "Reply sau prompt fix — đã/đủ để push GitLab"
                              : "Đề xuất chỉnh sửa (không push — dùng prompt fix để tạo reply)"}
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
                          {replyCopied ? "Đã copy" : "Copy"}
                        </Button>
                      </div>
                      <MarkdownPreview content={comment.suggestedReply} />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {comment.verdict === "VALID" &&
                      comment.fixReplyReady &&
                      !comment.pushedToGitlab && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => retryPushValid(comment.id)}
                          loading={actionLoading === `push-valid-${comment.id}`}
                        >
                          {actionLoading === `push-valid-${comment.id}`
                            ? "Đang push..."
                            : "Push lại lên GitLab"}
                        </Button>
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
