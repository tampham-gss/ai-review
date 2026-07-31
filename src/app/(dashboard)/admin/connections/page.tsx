"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function AdminConnectionsPage() {
  const [data, setData] = useState<{
    connections: Array<{
      id: string;
      name: string;
      host: string;
      isDefault: boolean;
      createdAt: string;
      user: { email: string; name: string | null };
    }>;
    byHost: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/connections")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Theo host</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          {Object.entries(data.byHost).map(([host, count]) => (
            <div
              key={host}
              className="rounded-lg border border-border bg-surface px-3 py-2"
            >
              <p className="font-mono text-xs">{host}</p>
              <p className="text-lg font-bold tabular-nums">{count}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-xs text-muted">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Host</th>
              <th className="px-3 py-2">Default</th>
            </tr>
          </thead>
          <tbody>
            {data.connections.map((c) => (
              <tr key={c.id} className="border-b border-border/50">
                <td className="px-3 py-2">{c.user.email}</td>
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{c.host}</td>
                <td className="px-3 py-2">{c.isDefault ? "Yes" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
