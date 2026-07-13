"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { CheckCircle2, ExternalLink } from "lucide-react";

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

  async function loadConnections() {
    const res = await fetch("/api/gitlab/connections");
    const data = await res.json();
    setConnections(data.connections ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadConnections();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/gitlab/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, host, token }),
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
      await loadConnections();
    } catch {
      toast.error("Lỗi kết nối khi lưu GitLab");
      setMessage("Lỗi kết nối khi lưu GitLab");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Kết nối GitLab</h1>
        <p className="mt-1 text-slate-400">
          Hỗ trợ gitlab.com (OAuth) và self-hosted qua Personal Access Token.
        </p>
      </div>

      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="text-base text-amber-200">GitLab nội bộ (LDAP)</CardTitle>
          <CardDescription>
            Với instance như{" "}
            <a
              href="https://gitlab.gss-sol.com/"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-300 hover:underline"
            >
              gitlab.gss-sol.com
            </a>
            , tạo PAT với scope <code className="text-amber-200">api</code> (full access đọc/ghi MR).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-300">
          <ol className="list-decimal space-y-1 pl-5">
            <li>User Settings → Access Tokens</li>
            <li>Scopes: <Badge>api</Badge> <Badge>read_api</Badge> <Badge>read_repository</Badge></li>
            <li>Dán token vào form bên dưới — token được mã hóa khi lưu</li>
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Thêm kết nối PAT</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-3">
              <Input placeholder="Tên hiển thị" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="https://gitlab.gss-sol.com" value={host} onChange={(e) => setHost(e.target.value)} />
              <Input
                type="password"
                placeholder="glpat-xxxxxxxx"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
              {message && (
                <p className={`text-sm ${message.includes("thành công") ? "text-emerald-400" : "text-red-400"}`}>
                  {message}
                </p>
              )}
              <Button type="submit" loading={saving}>
                {saving ? "Đang kiểm tra..." : "Lưu & kiểm tra kết nối"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kết nối hiện có</CardTitle>
          </CardHeader>
          <CardContent>
            {connections.length === 0 ? (
              <p className="text-sm text-slate-400">Chưa có kết nối nào.</p>
            ) : (
              <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
                {connections.map((c) => (
                  <div
                    key={c.id}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <a
                        href={c.host}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-0 items-center gap-1 text-sm text-slate-400 hover:text-cyan-300"
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
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
