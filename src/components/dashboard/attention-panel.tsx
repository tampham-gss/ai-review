"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  GitPullRequest,
  RefreshCw,
} from "lucide-react";

type AttentionItem = {
  id: string;
  kind:
    | "invalid_unpushed"
    | "valid_unpushed"
    | "validating"
    | "failed"
    | "open_mr";
  projectPath: string;
  projectId?: string;
  mrIid: number;
  mrTitle: string | null;
  sourceBranch?: string | null;
  gitlabHost?: string;
  connectionId?: string;
  sessionId?: string;
  invalidUnpushed?: number;
  validUnpushed?: number;
  unresolvedCount?: number | null;
  updatedAt: string;
  webUrl?: string | null;
  reason: string;
};

function buildReviewHref(item: AttentionItem): string {
  if (item.sessionId) return `/reviews/${item.sessionId}`;

  const params = new URLSearchParams();
  if (item.connectionId) params.set("connectionId", item.connectionId);
  if (item.gitlabHost) params.set("gitlabHost", item.gitlabHost);
  if (item.projectId) params.set("projectId", item.projectId);
  if (item.projectPath) params.set("projectPath", item.projectPath);
  params.set("mrIid", String(item.mrIid));
  if (item.sourceBranch) params.set("sourceBranch", item.sourceBranch);
  if (item.mrTitle) params.set("mrTitle", item.mrTitle);

  const qs = params.toString();
  return qs ? `/reviews?${qs}` : "/reviews";
}

const kindBadge: Record<
  AttentionItem["kind"],
  { label: string; variant: "invalid" | "valid" | "partial" | "high" | "violet" }
> = {
  invalid_unpushed: { label: "INVALID chưa push", variant: "invalid" },
  valid_unpushed: { label: "VALID chưa push", variant: "valid" },
  validating: { label: "Đang validate", variant: "partial" },
  failed: { label: "Thất bại", variant: "high" },
  open_mr: { label: "MR mở", variant: "violet" },
};

function mergeItems(local: AttentionItem[], remote: AttentionItem[]) {
  const map = new Map<string, AttentionItem>();
  for (const item of [...local, ...remote]) {
    map.set(item.id, item);
  }
  return [...map.values()].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function AttentionPanel() {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [loadingGitlab, setLoadingGitlab] = useState(false);

  const loadLocal = useCallback(async () => {
    setLoadingLocal(true);
    try {
      const res = await fetch("/api/reviews/attention?source=local");
      const data = await res.json();
      if (!res.ok) {
        toast.error(
          typeof data.error === "string"
            ? data.error
            : "Không tải được danh sách MR cần xử lý",
        );
        return [];
      }
      const list: AttentionItem[] = data.items ?? [];
      setItems(list);
      setCounts(data.counts ?? null);
      return list;
    } catch {
      toast.error("Lỗi kết nối khi tải MR cần xử lý");
      return [];
    } finally {
      setLoadingLocal(false);
    }
  }, []);

  const loadGitlab = useCallback(async (localItems: AttentionItem[]) => {
    setLoadingGitlab(true);
    try {
      const res = await fetch("/api/reviews/attention?source=gitlab");
      const data = await res.json();
      if (!res.ok) return;
      const remote: AttentionItem[] = data.items ?? [];
      if (remote.length === 0) return;
      setItems(mergeItems(localItems, remote));
      setCounts((prev) => ({
        ...(prev ?? {}),
        openMr: data.counts?.openMr ?? remote.length,
        total: mergeItems(localItems, remote).length,
      }));
    } catch {
      // GitLab phụ — không chặn UI
    } finally {
      setLoadingGitlab(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const local = await loadLocal();
    await loadGitlab(local);
  }, [loadLocal, loadGitlab]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await loadLocal();
      if (cancelled) return;
      await loadGitlab(local);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLocal, loadGitlab]);

  const loading = loadingLocal && items.length === 0;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitPullRequest className="h-5 w-5" />
            MR cần xử lý
          </CardTitle>
          <CardDescription>Đang tải từ lịch sử phiên…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border border-border bg-surface"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            MR cần xử lý
          </CardTitle>
          <CardDescription>
            INVALID/VALID chưa push, phiên lỗi
            {counts ? ` · ${counts.total ?? items.length} mục` : ""}
            {loadingGitlab ? " · đang lấy MR mở từ GitLab…" : ""}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          loading={loadingLocal || loadingGitlab}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Làm mới
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted">
            Không có MR cần xử lý lúc này. Chạy validate hoặc gắn webhook để tự
            động hóa.
          </p>
        ) : (
          <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {items.map((item) => {
              const badge = kindBadge[item.kind];
              const href = buildReviewHref(item);
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      <span className="truncate text-sm font-medium">
                        {item.projectPath} !{item.mrIid}
                      </span>
                    </div>
                    {item.mrTitle && (
                      <p className="truncate text-sm text-muted">{item.mrTitle}</p>
                    )}
                    <p className="text-xs text-muted-soft">{item.reason}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {item.webUrl && (
                      <a href={item.webUrl} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost">
                          <ExternalLink className="h-3.5 w-3.5" />
                          GitLab
                        </Button>
                      </a>
                    )}
                    <Link href={href}>
                      <Button size="sm" variant="secondary">
                        {item.sessionId ? "Mở phiên" : "Tạo review"}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
