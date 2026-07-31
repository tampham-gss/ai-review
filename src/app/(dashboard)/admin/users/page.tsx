"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { PageSkeleton } from "@/components/ui/skeleton";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isDisabled: boolean;
  monthlyTokenQuota: number | null;
  tokensThisMonth: number;
  createdAt: string;
  _count: { reviewSessions: number; gitlabConnections: number; aiProviders: number };
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi");
      setUsers(data.users ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải users");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Cập nhật thất bại");
      return;
    }
    toast.success("Đã cập nhật");
    await load();
  }

  async function remove(id: string, email: string) {
    if (!confirm(`Xóa user ${email}? Không hoàn tác.`)) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Xóa thất bại");
      return;
    }
    toast.success("Đã xóa user");
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Tìm email / tên..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Button variant="outline" onClick={() => void load()}>
          Tải lại
        </Button>
      </div>
      {loading ? (
        <PageSkeleton />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs text-muted">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Token tháng</th>
                <th className="px-3 py-2">Sessions</th>
                <th className="px-3 py-2">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/60">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{u.email}</div>
                    <div className="text-xs text-muted-soft">{u.name}</div>
                    {u.isDisabled && <Badge variant="invalid">Đã khóa</Badge>}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={u.role === "admin" ? "violet" : undefined}>
                      {u.role}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {u.tokensThisMonth.toLocaleString()}
                    <div className="text-xs text-muted-soft">
                      quota: {u.monthlyTokenQuota ?? "mặc định"}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{u._count.reviewSessions}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void patch(u.id, {
                            role: u.role === "admin" ? "user" : "admin",
                          })
                        }
                      >
                        {u.role === "admin" ? "Hạ user" : "Lên admin"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void patch(u.id, { isDisabled: !u.isDisabled })
                        }
                      >
                        {u.isDisabled ? "Mở khóa" : "Khóa"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const raw = prompt(
                            "Quota token/tháng (để trống = mặc định hệ thống, 0 = xóa override):",
                            u.monthlyTokenQuota?.toString() ?? "",
                          );
                          if (raw === null) return;
                          const trimmed = raw.trim();
                          void patch(u.id, {
                            monthlyTokenQuota:
                              trimmed === "" || trimmed === "0"
                                ? null
                                : Number(trimmed),
                          });
                        }}
                      >
                        Quota
                      </Button>
                      {u.email !== "admin" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void remove(u.id, u.email)}
                        >
                          Xóa
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
