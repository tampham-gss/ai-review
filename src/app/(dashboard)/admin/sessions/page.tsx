"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { PageSkeleton } from "@/components/ui/skeleton";

type SessionRow = {
  id: string;
  status: string;
  projectPath: string;
  mrIid: number;
  gitlabHost: string;
  sourceBranch: string;
  createdAt: string;
  updatedAt: string;
  user: { email: string; name: string | null };
  _count: { commentResults: number };
};

export default function AdminSessionsPage() {
  const [status, setStatus] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      const res = await fetch(`/api/admin/sessions${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi");
      setSessions(data.sessions ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải sessions");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markFailed(id: string) {
    const res = await fetch(`/api/admin/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "failed" }),
    });
    if (!res.ok) {
      toast.error("Cập nhật thất bại");
      return;
    }
    toast.success("Đã đánh dấu failed");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Xóa session này?")) return;
    const res = await fetch(`/api/admin/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Xóa thất bại");
      return;
    }
    toast.success("Đã xóa");
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["", "validating", "completed", "failed", "cancelled"].map((s) => (
          <Button
            key={s || "all"}
            size="sm"
            variant={status === s ? "default" : "outline"}
            onClick={() => setStatus(s)}
          >
            {s || "all"}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Tải lại
        </Button>
      </div>
      {loading ? (
        <PageSkeleton />
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{s.status}</Badge>
                  <Link
                    href={`/reviews/${s.id}`}
                    className="truncate font-medium text-violet-700 hover:underline dark:text-violet-300"
                  >
                    {s.projectPath} !{s.mrIid}
                  </Link>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {s.user.email} · {s._count.commentResults} comments ·{" "}
                  {new Date(s.updatedAt).toLocaleString("vi-VN")}
                </p>
              </div>
              <div className="flex gap-2">
                {s.status === "validating" && (
                  <Button size="sm" variant="outline" onClick={() => void markFailed(s.id)}>
                    Mark failed
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => void remove(s.id)}>
                  Xóa
                </Button>
              </div>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-sm text-muted">Không có session.</p>
          )}
        </div>
      )}
    </div>
  );
}
