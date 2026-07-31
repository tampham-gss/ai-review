"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/skeleton";
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
  mrIid: number;
  mrTitle: string | null;
  sourceBranch?: string | null;
  sessionId?: string;
  invalidUnpushed?: number;
  validUnpushed?: number;
  unresolvedCount?: number | null;
  updatedAt: string;
  webUrl?: string | null;
  reason: string;
};

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

export function AttentionPanel() {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews/attention");
      const data = await res.json();
      if (!res.ok) {
        toast.error(
          typeof data.error === "string"
            ? data.error
            : "Không tải được danh sách MR cần xử lý",
        );
        return;
      }
      setItems(data.items ?? []);
      setCounts(data.counts ?? null);
    } catch {
      toast.error("Lỗi kết nối khi tải MR cần xử lý");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading && items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitPullRequest className="h-5 w-5" />
            MR cần xử lý
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PageSkeleton />
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
            INVALID/VALID chưa push, phiên lỗi, và MR mở còn discussion chưa
            resolve
            {counts ? ` · ${counts.total ?? 0} mục` : ""}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} loading={loading}>
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
              const href = item.sessionId
                ? `/reviews/${item.sessionId}`
                : "/reviews";
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
