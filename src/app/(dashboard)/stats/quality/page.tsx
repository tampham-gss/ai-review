"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import type { StatsRange } from "@/lib/stats";
import {
  BarChart3,
  Building2,
  CalendarDays,
  RefreshCw,
  UserRound,
} from "lucide-react";

interface QualityRow {
  key: string;
  label: string;
  total: number;
  valid: number;
  invalid: number;
  partial: number;
  other: number;
  invalidRate: number;
  validRate: number;
  avgConfidence: number | null;
  pushed: number;
}

interface QualityResponse {
  range: StatsRange;
  rangeLabel: string;
  start: string;
  end: string;
  summary: {
    comments: number;
    valid: number;
    invalid: number;
    partial: number;
    invalidRate: number;
  };
  byProject: QualityRow[];
  byReviewer: QualityRow[];
  byWeek: QualityRow[];
}

function QualityTable({
  title,
  icon,
  rows,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  rows: QualityRow[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-2 font-medium">Tên</th>
                  <th className="py-2 pr-2 font-medium">Tổng</th>
                  <th className="py-2 pr-2 font-medium">VALID</th>
                  <th className="py-2 pr-2 font-medium">INVALID</th>
                  <th className="py-2 pr-2 font-medium">% Invalid</th>
                  <th className="py-2 font-medium">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border/60">
                    <td className="max-w-[200px] truncate py-2 pr-2 font-medium">
                      {r.label}
                    </td>
                    <td className="py-2 pr-2">{r.total}</td>
                    <td className="py-2 pr-2 text-emerald-600 dark:text-emerald-400">
                      {r.valid}
                    </td>
                    <td className="py-2 pr-2 text-orange-600 dark:text-orange-400">
                      {r.invalid}
                    </td>
                    <td className="py-2 pr-2">
                      <Badge
                        variant={
                          r.invalidRate >= 50
                            ? "invalid"
                            : r.invalidRate >= 25
                              ? "partial"
                              : "valid"
                        }
                      >
                        {r.invalidRate}%
                      </Badge>
                    </td>
                    <td className="py-2 text-muted">
                      {r.avgConfidence != null
                        ? r.avgConfidence.toFixed(2)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function QualityReportPage() {
  const [range, setRange] = useState<StatsRange>("month");
  const [data, setData] = useState<QualityResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stats/quality?range=${range}`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(
          typeof json.error === "string" ? json.error : "Không tải được báo cáo",
        );
        return;
      }
      setData(json);
    } catch {
      toast.error("Lỗi kết nối khi tải báo cáo chất lượng");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Báo cáo chất lượng review
          </h1>
          <p className="mt-1 text-muted">
            Tỷ lệ VALID / INVALID theo project, reviewer và tuần
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/stats">
            <Button variant="outline" size="sm">
              Thống kê tổng
            </Button>
          </Link>
          {(["week", "month"] as StatsRange[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "secondary"}
              onClick={() => setRange(r)}
            >
              {r === "week" ? "Tuần này" : "8 tuần gần đây"}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={load} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Comments</CardDescription>
                <CardTitle className="text-2xl">{data.summary.comments}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>VALID</CardDescription>
                <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">
                  {data.summary.valid}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>INVALID</CardDescription>
                <CardTitle className="text-2xl text-orange-600 dark:text-orange-400">
                  {data.summary.invalid}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>% Invalid</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <BarChart3 className="h-5 w-5 text-muted" />
                  {data.summary.invalidRate}%
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <QualityTable
            title="Theo project"
            icon={<Building2 className="h-4 w-4" />}
            rows={data.byProject}
            empty="Chưa có dữ liệu theo project."
          />
          <QualityTable
            title="Theo reviewer (author comment)"
            icon={<UserRound className="h-4 w-4" />}
            rows={data.byReviewer}
            empty="Chưa có dữ liệu theo reviewer."
          />
          <QualityTable
            title="Theo tuần"
            icon={<CalendarDays className="h-4 w-4" />}
            rows={data.byWeek}
            empty="Chưa có dữ liệu theo tuần."
          />
        </>
      )}
    </div>
  );
}
