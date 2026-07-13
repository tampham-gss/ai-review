"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import type { StatsRange } from "@/lib/stats";
import {
  BarChart3,
  Bot,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Zap,
} from "lucide-react";
import { StarRating } from "@/components/ui/star-rating";
import { getProviderMeta } from "@/lib/ai/provider-registry";
import type { StarScore } from "@/lib/ai/model-rating";

interface StatsResponse {
  range: StatsRange;
  rangeLabel: string;
  start: string;
  end: string;
  summary: {
    sessions: number;
    comments: number;
    tokens: number;
    pushedReplies: number;
    lifetimeTokens: number;
  };
  verdicts: {
    VALID: number;
    INVALID: number;
    PARTIAL: number;
    OTHER: number;
  };
  statusCounts: {
    completed: number;
    cancelled: number;
    validating: number;
    pending: number;
  };
  tokensByAction: {
    validate: number;
    fix: number;
  };
  topProjects: Array<{ projectPath: string; count: number }>;
  timeline: Array<{
    key: string;
    label: string;
    sessions: number;
    comments: number;
    tokens: number;
  }>;
  providers: Array<{
    id: string;
    provider: string;
    model: string | null;
    tokensUsed: number;
    tokenLimit: number | null;
    remaining: number | null;
  }>;
  modelRatings: Array<{
    providerId: string;
    provider: string;
    model: string | null;
    overallStars: StarScore;
    capabilityStars: StarScore;
    performanceStars: StarScore | null;
    label: string;
    reason: string;
    sampleSize: number;
    avgConfidence: number | null;
    sessionCount: number;
  }>;
  bestModel: {
    providerId: string;
    provider: string;
    model: string | null;
    overallStars: StarScore;
    label: string;
    reason: string;
  } | null;
}

const RANGES: Array<{ id: StatsRange; label: string }> = [
  { id: "day", label: "Ngày" },
  { id: "week", label: "Tuần" },
  { id: "month", label: "Tháng" },
];

function formatNumber(n: number) {
  return n.toLocaleString("vi-VN");
}

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-violet-400" />
          {title}
        </CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function SimpleBars({
  items,
  valueKey,
}: {
  items: StatsResponse["timeline"];
  valueKey: "sessions" | "comments" | "tokens";
}) {
  const max = Math.max(1, ...items.map((i) => i[valueKey]));
  const hasAnyValue = items.some((i) => i[valueKey] > 0);

  return (
    <div className="space-y-3">
      {!hasAnyValue && (
        <p className="text-sm text-muted-soft">Chưa có dữ liệu trong kỳ này.</p>
      )}
      <div className="flex h-56 gap-1.5 overflow-x-auto pb-1">
        {items.map((item) => {
          const value = item[valueKey];
          const heightPct = Math.round((value / max) * 100);
          return (
            <div
              key={item.key}
              className="flex h-full min-w-8 flex-1 flex-col items-center gap-1.5"
              title={`${item.label}: ${formatNumber(value)}`}
            >
              <span className="h-4 shrink-0 text-[10px] tabular-nums text-muted">
                {value > 0 ? formatNumber(value) : ""}
              </span>
              <div className="relative flex w-full flex-1 items-end justify-center rounded-t-md bg-surface">
                <div
                  className="w-full min-h-0 rounded-t-md bg-gradient-to-t from-violet-600 to-cyan-400 transition-all duration-300"
                  style={{
                    height: value > 0 ? `${Math.max(heightPct, 6)}%` : "0%",
                  }}
                />
              </div>
              <span className="h-4 shrink-0 truncate text-[10px] text-muted">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function StatsPage() {
  const [range, setRange] = useState<StatsRange>("week");
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chartMetric, setChartMetric] = useState<"sessions" | "comments" | "tokens">(
    "sessions",
  );

  const load = useCallback(async (nextRange: StatsRange, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/stats?range=${nextRange}`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(typeof json.error === "string" ? json.error : "Không tải được thống kê");
        return;
      }
      setData(json);
    } catch {
      toast.error("Lỗi kết nối khi tải thống kê");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const verdictTotal = useMemo(() => {
    if (!data) return 0;
    return (
      data.verdicts.VALID +
      data.verdicts.INVALID +
      data.verdicts.PARTIAL +
      data.verdicts.OTHER
    );
  }, [data]);

  if (loading && !data) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
            <BarChart3 className="h-7 w-7 shrink-0 text-cyan-700 dark:text-cyan-400" />
            Thống kê sử dụng
          </h1>
          <p className="mt-1 text-muted">
            Theo dõi phiên review, comment và token AI theo ngày / tuần / tháng.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.id}
              size="sm"
              variant={range === r.id ? "default" : "secondary"}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            loading={refreshing}
            onClick={() => load(range, true)}
          >
            {!refreshing && <RefreshCw className="h-4 w-4" />}
            Làm mới
          </Button>
        </div>
      </div>

      {data && (
        <>
          <p className="text-sm text-muted-soft">
            Kỳ: <span className="text-muted">{data.rangeLabel}</span> ·{" "}
            {new Date(data.start).toLocaleString("vi-VN")} →{" "}
            {new Date(data.end).toLocaleString("vi-VN")}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Phiên review"
              value={formatNumber(data.summary.sessions)}
              hint="Số lần chạy validate"
              icon={ShieldCheck}
            />
            <MetricCard
              title="Comment"
              value={formatNumber(data.summary.comments)}
              hint="Comment đã validate"
              icon={MessageSquare}
            />
            <MetricCard
              title="Token kỳ này"
              value={formatNumber(data.summary.tokens)}
              hint="Từ log AI trong kỳ"
              icon={Zap}
            />
            <MetricCard
              title="Reply đã push"
              value={formatNumber(data.summary.pushedReplies)}
              hint="Đã đẩy lên GitLab"
              icon={Bot}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Biểu đồ theo thời gian</CardTitle>
                  <CardDescription>Chọn metric để xem xu hướng sử dụng</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["sessions", "Phiên"],
                      ["comments", "Comment"],
                      ["tokens", "Token"],
                    ] as const
                  ).map(([id, label]) => (
                    <Button
                      key={id}
                      size="sm"
                      variant={chartMetric === id ? "default" : "secondary"}
                      onClick={() => setChartMetric(id)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <SimpleBars items={data.timeline} valueKey={chartMetric} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Verdict</CardTitle>
                <CardDescription>Phân bố kết quả AI trong kỳ</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(
                  [
                    ["VALID", data.verdicts.VALID, "valid"],
                    ["INVALID", data.verdicts.INVALID, "invalid"],
                    ["PARTIAL", data.verdicts.PARTIAL, "partial"],
                    ["OTHER", data.verdicts.OTHER, "default"],
                  ] as const
                ).map(([label, count, variant]) => {
                  const pct = verdictTotal ? Math.round((count / verdictTotal) * 100) : 0;
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <Badge variant={variant === "default" ? undefined : variant}>
                          {label}
                        </Badge>
                        <span className="text-muted">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            label === "VALID" && "bg-emerald-500",
                            label === "INVALID" && "bg-red-500",
                            label === "PARTIAL" && "bg-amber-500",
                            label === "OTHER" && "bg-slate-500",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Token theo hành động</CardTitle>
                <CardDescription>
                  Lifetime: {formatNumber(data.summary.lifetimeTokens)} tokens
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
                  <span className="text-sm text-muted">Validate</span>
                  <span className="font-mono font-medium">
                    {formatNumber(data.tokensByAction.validate)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
                  <span className="text-sm text-muted">AI Fix</span>
                  <span className="font-mono font-medium">
                    {formatNumber(data.tokensByAction.fix)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge variant="valid">{data.statusCounts.completed} hoàn tất</Badge>
                  <Badge variant="invalid">{data.statusCounts.cancelled} dừng</Badge>
                  <Badge variant="violet">{data.statusCounts.validating} đang chạy</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Project hoạt động nhiều</CardTitle>
                <CardDescription>Top project theo số phiên trong kỳ</CardDescription>
              </CardHeader>
              <CardContent>
                {data.topProjects.length === 0 ? (
                  <p className="text-sm text-muted">Chưa có dữ liệu trong kỳ này.</p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {data.topProjects.map((p) => (
                      <div
                        key={p.projectPath}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm" title={p.projectPath}>
                          {p.projectPath}
                        </span>
                        <Badge className="shrink-0">{p.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-400" />
                Xếp hạng model AI
              </CardTitle>
              <CardDescription>
                Sao = sức mạnh model + hiệu suất thực tế (confidence, hoàn tất phiên).
                {data.bestModel && (
                  <>
                    {" "}
                    Đang dẫn đầu:{" "}
                    <span className="text-amber-900 dark:text-amber-200">
                      {getProviderMeta(data.bestModel.provider)?.label ??
                        data.bestModel.provider}{" "}
                      · {data.bestModel.model ?? "default"} ({data.bestModel.label})
                    </span>
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.modelRatings.length === 0 ? (
                <p className="text-sm text-muted">Chưa có provider để xếp hạng.</p>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {data.modelRatings.map((r, idx) => (
                    <div
                      key={r.providerId}
                      className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-muted-soft">
                            #{idx + 1}
                          </span>
                          <p className="truncate font-medium">
                            {getProviderMeta(r.provider)?.label ?? r.provider}
                          </p>
                          {idx === 0 && <Badge variant="violet">Tốt nhất</Badge>}
                        </div>
                        <p className="truncate font-mono text-xs text-muted-soft">
                          {r.model ?? "default"}
                        </p>
                        <p className="mt-1 text-xs text-muted-soft">{r.reason}</p>
                      </div>
                      <div className="shrink-0 space-y-1 sm:text-right">
                        <StarRating
                          stars={r.overallStars}
                          showValue
                          label={r.label}
                        />
                        <p className="text-[11px] text-muted-soft">
                          Model {r.capabilityStars}★
                          {r.performanceStars
                            ? ` · Thực tế ${r.performanceStars}★`
                            : " · Chưa đủ mẫu thực tế"}
                          {r.avgConfidence != null
                            ? ` · conf ${Math.round(r.avgConfidence * 100)}%`
                            : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI Providers (lifetime)</CardTitle>
              <CardDescription>Tổng token đã dùng trên từng provider</CardDescription>
            </CardHeader>
            <CardContent>
              {data.providers.length === 0 ? (
                <p className="text-sm text-muted">Chưa cấu hình provider.</p>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {data.providers.map((p) => {
                    const rating = data.modelRatings.find(
                      (r) => r.providerId === p.id,
                    );
                    return (
                      <div
                        key={p.id}
                        className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {getProviderMeta(p.provider)?.label ?? p.provider}
                          </p>
                          <p className="truncate text-xs text-muted-soft">
                            {p.model ?? "default"}
                          </p>
                          {rating && (
                            <StarRating
                              className="mt-1"
                              stars={rating.overallStars}
                              showValue
                              label={rating.label}
                            />
                          )}
                        </div>
                        <div className="shrink-0 text-right text-muted">
                          <p className="font-mono">{formatNumber(p.tokensUsed)}</p>
                          <p className="text-xs text-muted-soft">
                            còn{" "}
                            {p.remaining === null ? "∞" : formatNumber(p.remaining)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
