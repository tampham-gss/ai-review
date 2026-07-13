"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CommentSkeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  MessageSquare,
  Wrench,
} from "lucide-react";
import {
  AiProviderPicker,
} from "@/components/reviews/ai-provider-picker";
import { CardDescription } from "@/components/ui/card";

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
  zipWarning: boolean;
  hasFixedSource: boolean;
  commentResults: CommentResult[];
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
  const [providerSaving, setProviderSaving] = useState(false);

  const loadSession = useCallback(async () => {
    const res = await fetch(`/api/reviews/${params.id}`);
    const data = await res.json();
    setSession(data.session);
    setProviderId(data.session?.aiProviderId ?? data.session?.aiProvider?.id ?? null);
    setLoading(false);
  }, [params.id]);

  async function changeProvider(nextId: string) {
    setProviderId(nextId);
    if (nextId === session?.aiProviderId) return;

    setProviderSaving(true);
    await fetch(`/api/reviews/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiProviderId: nextId }),
    });
    setProviderSaving(false);
    loadSession();
  }

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  async function fixComment(commentId: string) {
    setActionLoading(commentId);
    await fetch("/api/reviews/fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: params.id,
        commentIds: [commentId],
        providerId: providerId ?? undefined,
      }),
    });
    setActionLoading("");
    loadSession();
  }

  async function fixAllValid() {
    setActionLoading("fix-all");
    await fetch("/api/reviews/fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: params.id,
        fixAllValid: true,
        providerId: providerId ?? undefined,
      }),
    });
    setActionLoading("");
    loadSession();
  }

  async function pushComment(commentId: string) {
    setActionLoading(`push-${commentId}`);
    await fetch("/api/reviews/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: params.id, commentIds: [commentId] }),
    });
    setActionLoading("");
    loadSession();
  }

  async function pushAllInvalid() {
    setActionLoading("push-all");
    await fetch("/api/reviews/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: params.id, pushAllInvalid: true }),
    });
    setActionLoading("");
    loadSession();
  }

  async function pushValidReply(commentId: string) {
    setActionLoading(`push-valid-${commentId}`);
    await fetch("/api/reviews/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: params.id, commentIds: [commentId] }),
    });
    setActionLoading("");
    loadSession();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/reviews">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">
            {session.projectPath} !{session.mrIid}
          </h1>
          <p className="text-sm text-slate-400">{session.sourceBranch} · {session.status}</p>
        </div>
      </div>

      {session.zipWarning && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Phiên này dùng source ZIP upload — kết quả có thể lệch so với GitLab.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Provider cho phiên này</CardTitle>
          <CardDescription>
            {session.aiProvider
              ? `Đang dùng: ${session.aiProvider.label} · ${session.aiProvider.model ?? "default"}`
              : "Chưa ghi nhận provider — chọn model trước khi fix comment."}
            {providerSaving && " · Đang lưu..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AiProviderPicker
            value={providerId}
            onChange={changeProvider}
            autoSelectDefault={!session.aiProviderId}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Badge variant="valid">{validCount} hợp lý</Badge>
        <Badge variant="invalid">{invalidCount} không hợp lý</Badge>
        <Badge>{session.commentResults.length} tổng unresolved</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {validCount > 0 && (
          <Button
            variant="success"
            onClick={fixAllValid}
            disabled={actionLoading === "fix-all"}
          >
            <Wrench className="h-4 w-4" />
            AI fix tất cả VALID (1 source)
          </Button>
        )}
        {invalidCount > 0 && (
          <Button
            variant="destructive"
            onClick={pushAllInvalid}
            disabled={actionLoading === "push-all"}
          >
            <MessageSquare className="h-4 w-4" />
            Push tất cả lý do INVALID
          </Button>
        )}
        {session.hasFixedSource && (
          <a href={`/api/reviews/${session.id}/download`}>
            <Button variant="secondary">
              <Download className="h-4 w-4" />
              Tải source đã fix
            </Button>
          </a>
        )}
      </div>

      <div className="space-y-4">
        {session.commentResults.map((comment) => (
          <Card key={comment.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                {verdictBadge(comment.verdict)}
                {comment.severity && <Badge variant="high">{comment.severity}</Badge>}
                {comment.filePath && (
                  <span className="font-mono text-xs text-cyan-300">
                    {comment.filePath}:{comment.line}
                  </span>
                )}
                {comment.pushedToGitlab && <Badge variant="violet">Đã push</Badge>}
              </div>
              <CardTitle className="text-sm font-normal text-slate-300">
                {comment.author}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <pre className="max-h-40 overflow-auto rounded-xl bg-black/30 p-3 text-xs text-slate-300 whitespace-pre-wrap">
                {comment.body.slice(0, 600)}
                {comment.body.length > 600 ? "..." : ""}
              </pre>

              {comment.reasonShort && (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-sm font-medium text-white">{comment.reasonShort}</p>
                  {comment.reasonDetail && (
                    <p className="mt-2 text-sm text-slate-400">{comment.reasonDetail}</p>
                  )}
                  {comment.confidence != null && (
                    <p className="mt-2 text-xs text-slate-500">
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
                  <p
                    className={`mb-1 text-xs font-medium ${
                      comment.verdict === "INVALID" ? "text-orange-300" : "text-violet-300"
                    }`}
                  >
                    {comment.verdict === "INVALID"
                      ? "Reply phản bác — bảo vệ code hiện tại"
                      : "Reply đề xuất"}
                  </p>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">
                    {comment.suggestedReply}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {comment.verdict === "VALID" && (
                  <>
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => fixComment(comment.id)}
                      disabled={actionLoading === comment.id}
                    >
                      AI fix comment này
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => pushValidReply(comment.id)}
                      disabled={actionLoading === `push-valid-${comment.id}`}
                    >
                      Push reply đã fix
                    </Button>
                  </>
                )}
                {comment.verdict === "INVALID" && !comment.pushedToGitlab && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => pushComment(comment.id)}
                    disabled={actionLoading === `push-${comment.id}`}
                  >
                    Push lý do invalid
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
