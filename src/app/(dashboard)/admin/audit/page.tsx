"use client";

import { useEffect, useState } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<
    Array<{
      id: string;
      action: string;
      targetType: string | null;
      targetId: string | null;
      metaJson: string | null;
      createdAt: string;
      actor: { email: string; name: string | null } | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/audit")
      .then((r) => r.json())
      .then((d) => setLogs(d.logs ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border bg-surface text-xs text-muted">
          <tr>
            <th className="px-3 py-2">Thời gian</th>
            <th className="px-3 py-2">Actor</th>
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Target</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-border/50">
              <td className="px-3 py-2 text-xs text-muted">
                {new Date(l.createdAt).toLocaleString("vi-VN")}
              </td>
              <td className="px-3 py-2">{l.actor?.email ?? "system"}</td>
              <td className="px-3 py-2 font-mono text-xs">{l.action}</td>
              <td className="px-3 py-2 text-xs text-muted">
                {l.targetType}
                {l.targetId ? `:${l.targetId.slice(0, 8)}` : ""}
              </td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-muted">
                Chưa có audit log.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
