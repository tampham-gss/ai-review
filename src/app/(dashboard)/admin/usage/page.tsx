"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function AdminUsagePage() {
  const [range, setRange] = useState<"day" | "week" | "month">("month");
  const [data, setData] = useState<{
    byUser: Array<{ email: string; name: string | null; tokens: number; events: number }>;
    byAction: Array<{ action: string; tokens: number; events: number }>;
    timeline: Array<{ day: string; tokens: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/usage?range=${range}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading) return <PageSkeleton />;
  if (!data) return <p className="text-red-400">Không tải được usage.</p>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["day", "week", "month"] as const).map((r) => (
          <Button
            key={r}
            size="sm"
            variant={range === r ? "default" : "outline"}
            onClick={() => setRange(r)}
          >
            {r}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top users theo token</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.byUser.length === 0 && (
              <p className="text-muted">Chưa có usage.</p>
            )}
            {data.byUser.map((u) => (
              <div
                key={u.email}
                className="flex items-center justify-between gap-2 border-b border-border/50 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.email}</p>
                  <p className="text-xs text-muted-soft">{u.events} events</p>
                </div>
                <p className="tabular-nums font-semibold">
                  {u.tokens.toLocaleString()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Theo action</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.byAction.map((a) => (
              <div
                key={a.action}
                className="flex justify-between border-b border-border/50 py-1.5"
              >
                <span>{a.action}</span>
                <span className="tabular-nums font-semibold">
                  {a.tokens.toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline (ngày)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {data.timeline.map((t) => (
            <div key={String(t.day)} className="flex justify-between">
              <span className="text-muted">
                {new Date(t.day).toLocaleDateString("vi-VN")}
              </span>
              <span className="tabular-nums">{t.tokens.toLocaleString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
