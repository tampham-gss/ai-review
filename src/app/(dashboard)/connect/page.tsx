"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import {
  CheckCircle2,
  ExternalLink,
  Pencil,
  PlugZap,
  Star,
  Trash2,
  X,
} from "lucide-react";

interface Connection {
  id: string;
  name: string;
  host: string;
  isDefault: boolean;
}

export default function ConnectPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("GitLab nội bộ");
  const [host, setHost] = useState("https://gitlab.gss-sol.com");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);

  async function loadConnections() {
    const res = await fetch("/api/gitlab/connections");
    const data = await res.json();
    setConnections(data.connections ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadConnections();
  }, []);

  function resetForm() {
    setEditingId(null);
    setName("GitLab nội bộ");
    setHost("https://gitlab.gss-sol.com");
    setToken("");
    setMakeDefault(false);
    setMessage("");
  }

  function startEdit(c: Connection) {
    setEditingId(c.id);
    setName(c.name);
    setHost(c.host);
    setToken("");
    setMessage("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      if (editingId) {
        const res = await fetch(`/api/gitlab/connections/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            host,
            ...(token.trim() ? { token: token.trim() } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const err = data.error ?? "Cập nhật thất bại";
          setMessage(err);
          toast.error(err);
          return;
        }
        const ok = `Đã cập nhật — ${data.user?.username ?? "OK"}`;
        setMessage(ok);
        toast.success(ok);
        setToken("");
        setEditingId(null);
        await loadConnections();
        return;
      }

      const res = await fetch("/api/gitlab/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          host,
          token,
          ...(makeDefault || connections.length === 0
            ? { isDefault: true }
            : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const err = data.error ?? "Kết nối thất bại";
        setMessage(err);
        toast.error(err);
        return;
      }

      const ok = `Kết nối thành công: ${data.user?.username ?? "OK"}`;
      setMessage(ok);
      toast.success(ok);
      setToken("");
      setMakeDefault(false);
      await loadConnections();
    } catch {
      toast.error("Lỗi kết nối khi lưu GitLab");
      setMessage("Lỗi kết nối khi lưu GitLab");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(id: string) {
    setActionId(`test-${id}`);
    try {
      const res = await fetch(`/api/gitlab/connections/${id}/test`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Test thất bại");
        return;
      }
      toast.success(data.message ?? "Kết nối OK");
    } catch {
      toast.error("Lỗi khi test kết nối");
    } finally {
      setActionId("");
    }
  }

  async function setDefault(id: string) {
    setActionId(`default-${id}`);
    try {
      const res = await fetch(`/api/gitlab/connections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Đặt mặc định thất bại");
        return;
      }
      toast.success("Đã đặt làm kết nối mặc định");
      await loadConnections();
    } catch {
      toast.error("Lỗi khi đặt mặc định");
    } finally {
      setActionId("");
    }
  }

  async function deleteConnection(id: string) {
    if (!confirm("Xóa kết nối GitLab này?")) return;
    setActionId(`delete-${id}`);
    try {
      const res = await fetch(`/api/gitlab/connections/${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Xóa thất bại");
        return;
      }
      toast.success("Đã xóa kết nối");
      if (editingId === id) resetForm();
      await loadConnections();
    } catch {
      toast.error("Lỗi khi xóa kết nối");
    } finally {
      setActionId("");
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Kết nối GitLab</h1>
        <p className="mt-1 text-muted">
          Thêm nhiều GitLab (PAT / OAuth), chọn một kết nối mặc định để dùng khi
          review.
        </p>
      </div>

      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="text-base text-amber-900 dark:text-amber-200">GitLab nội bộ (LDAP)</CardTitle>
          <CardDescription>
            Với instance như{" "}
            <a
              href="https://gitlab.gss-sol.com/"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-700 hover:underline dark:text-cyan-300"
            >
              gitlab.gss-sol.com
            </a>
            , tạo PAT với scope <code className="text-amber-900 dark:text-amber-200">api</code> (full access đọc/ghi MR).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted">
          <ol className="list-decimal space-y-1 pl-5">
            <li>User Settings → Access Tokens</li>
            <li>
              Scopes: <Badge>api</Badge> <Badge>read_api</Badge>{" "}
              <Badge>read_repository</Badge>
            </li>
            <li>Dán token vào form bên dưới — token được mã hóa khi lưu</li>
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>
                {editingId ? "Sửa kết nối" : "Thêm kết nối PAT"}
              </CardTitle>
              <CardDescription>
                {editingId
                  ? "Để trống token nếu không đổi PAT"
                  : "Lưu & kiểm tra token trước khi dùng"}
              </CardDescription>
            </div>
            {editingId && (
              <Button variant="ghost" size="sm" onClick={resetForm}>
                <X className="h-4 w-4" />
                Hủy
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-3">
              <Input
                placeholder="Tên hiển thị"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                placeholder="https://gitlab.gss-sol.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder={
                  editingId ? "Token mới (để trống nếu giữ nguyên)" : "glpat-xxxxxxxx"
                }
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required={!editingId}
              />
              {!editingId && (
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={makeDefault || connections.length === 0}
                    disabled={connections.length === 0}
                    onChange={(e) => setMakeDefault(e.target.checked)}
                    className="rounded border-border"
                  />
                  Đặt làm GitLab mặc định
                  {connections.length === 0 ? " (kết nối đầu tiên)" : ""}
                </label>
              )}
              {message && (
                <p
                  className={`text-sm ${
                    message.toLowerCase().includes("thành công") ||
                    message.toLowerCase().includes("cập nhật")
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {message}
                </p>
              )}
              <Button type="submit" loading={saving}>
                {saving
                  ? "Đang kiểm tra..."
                  : editingId
                    ? "Cập nhật & kiểm tra"
                    : "Lưu & kiểm tra kết nối"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Kết nối hiện có
              {connections.length > 0 ? ` (${connections.length})` : ""}
            </CardTitle>
            <CardDescription>
              Hiển thị tất cả kết nối — nhấn Mặc định để chọn GitLab dùng ưu tiên
            </CardDescription>
          </CardHeader>
          <CardContent>
            {connections.length === 0 ? (
              <p className="text-sm text-muted">Chưa có kết nối nào.</p>
            ) : (
              <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
                {connections.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-xl border p-4 ${
                      editingId === c.id
                        ? "border-violet-500/40 bg-violet-500/5"
                        : "border-border bg-surface"
                    }`}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.name}</p>
                        <a
                          href={c.host}
                          target="_blank"
                          rel="noreferrer"
                          className="flex min-w-0 items-center gap-1 text-sm text-muted hover:text-cyan-700 dark:hover:text-cyan-300"
                        >
                          <span className="truncate">{c.host}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {c.isDefault && <Badge variant="violet">Mặc định</Badge>}
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => testConnection(c.id)}
                        loading={actionId === `test-${c.id}`}
                      >
                        {actionId !== `test-${c.id}` && (
                          <PlugZap className="h-3.5 w-3.5" />
                        )}
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(c)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Sửa
                      </Button>
                      {!c.isDefault && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setDefault(c.id)}
                          loading={actionId === `default-${c.id}`}
                        >
                          {actionId !== `default-${c.id}` && (
                            <Star className="h-3.5 w-3.5" />
                          )}
                          Mặc định
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteConnection(c.id)}
                        loading={actionId === `delete-${c.id}`}
                      >
                        {actionId !== `delete-${c.id}` && (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Xóa
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
