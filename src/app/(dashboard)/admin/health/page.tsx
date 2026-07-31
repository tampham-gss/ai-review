"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function AdminHealthPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [overview, setOverview] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/health").then((r) => r.json()),
      fetch("/api/admin/overview").then((r) => r.json()),
    ]).then(([h, o]) => {
      setHealth(h);
      setOverview(o.overview ?? null);
    });
  }, []);

  if (!health) return <PageSkeleton />;

  const ok = health.ok === true || health.status === "ok";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">System health</CardTitle>
          <Badge variant={ok ? "valid" : "invalid"}>
            {ok ? "OK" : "DEGRADED"}
          </Badge>
        </CardHeader>
        <CardContent>
          <pre className="max-h-80 overflow-auto rounded-lg bg-black/30 p-3 text-xs">
            {JSON.stringify(health, null, 2)}
          </pre>
        </CardContent>
      </Card>
      {overview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Runtime snapshot</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <p>Validating sessions: {overview.validatingCount}</p>
            <p>Failed/cancelled: {overview.failedCount}</p>
            <p>Tokens 24h: {overview.tokensDay?.toLocaleString?.()}</p>
            <p>Users: {overview.userCount}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
