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
  Copy,
  Link2,
  RefreshCw,
  Trash2,
  Webhook,
} from "lucide-react";

interface Connection {
  id: string;
  name: string;
  host: string;
  isOwner?: boolean;
}

interface Category {
  id: string;
  name: string;
  level: number;
  isOwner?: boolean;
}

interface Provider {
  id: string;
  provider: string;
  model: string | null;
  isOwner?: boolean;
}

interface WebhookConfig {
  id: string;
  name: string;
  secret: string;
  triggerPhrase: string;
  connectionId: string;
  selectedCategoryIds: string[];
  aiProviderId: string | null;
  isEnabled: boolean;
  lastTriggeredAt: string | null;
  lastSessionId: string | null;
  lastError: string | null;
}

export default function WebhookSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<WebhookConfig[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [defaultPhrase, setDefaultPhrase] = useState("Agent reject review");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);

  const [name, setName] = useState("GitLab auto validate");
  const [triggerPhrase, setTriggerPhrase] = useState("Agent reject review");
  const [connectionId, setConnectionId] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [providerId, setProviderId] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState("");

  async function load() {
    try {
      const [whRes, connRes, catRes, aiRes] = await Promise.all([
        fetch("/api/webhooks/config"),
        fetch("/api/gitlab/connections"),
        fetch("/api/conventions/categories"),
        fetch("/api/ai/providers"),
      ]);
      const wh = await whRes.json();
      const conn = await connRes.json();
      const cat = await catRes.json();
      const ai = await aiRes.json();

      if (!whRes.ok) {
        toast.error(typeof wh.error === "string" ? wh.error : "Không tải webhook");
        return;
      }

      setConfigs(wh.configs ?? []);
      setWebhookUrl(wh.webhookUrl ?? "");
      setDefaultPhrase(wh.defaultTriggerPhrase ?? "Agent reject review");
      setTriggerPhrase((p) => p || wh.defaultTriggerPhrase || "Agent reject review");

      const ownedConns = (conn.connections ?? []).filter(
        (c: Connection) => c.isOwner !== false,
      );
      setConnections(ownedConns);
      if (!connectionId && ownedConns[0]) setConnectionId(ownedConns[0].id);

      const ownedCats = (cat.categories ?? []).filter(
        (c: Category) => c.isOwner !== false,
      );
      setCategories(ownedCats);

      const ownedProviders = (ai.providers ?? []).filter(
        (p: Provider) => p.isOwner !== false,
      );
      setProviders(ownedProviders);
    } catch {
      toast.error("Lỗi kết nối khi tải cấu hình webhook");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCategory(id: string) {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function createConfig() {
    if (!connectionId) {
      toast.error("Chọn GitLab connection");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/webhooks/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          triggerPhrase: triggerPhrase.trim() || defaultPhrase,
          connectionId,
          selectedCategoryIds: selectedCategories,
          aiProviderId: providerId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Tạo thất bại");
        return;
      }
      toast.success("Đã tạo webhook — copy secret sang GitLab");
      await load();
    } catch {
      toast.error("Lỗi khi tạo webhook");
    } finally {
      setSaving(false);
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Đã copy ${label}`);
    } catch {
      toast.error("Không copy được");
    }
  }

  async function toggleEnabled(c: WebhookConfig) {
    setActionId(`toggle-${c.id}`);
    try {
      const res = await fetch(`/api/webhooks/config/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !c.isEnabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Cập nhật thất bại");
        return;
      }
      await load();
    } finally {
      setActionId("");
    }
  }

  async function rotateSecret(id: string) {
    if (!confirm("Tạo secret mới? Cần cập nhật lại trên GitLab.")) return;
    setActionId(`rotate-${id}`);
    try {
      const res = await fetch(`/api/webhooks/config/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotateSecret: true }),
      });
      if (!res.ok) {
        toast.error("Đổi secret thất bại");
        return;
      }
      toast.success("Đã tạo secret mới");
      await load();
    } finally {
      setActionId("");
    }
  }

  async function removeConfig(id: string) {
    if (!confirm("Xóa cấu hình webhook này?")) return;
    setActionId(`del-${id}`);
    try {
      const res = await fetch(`/api/webhooks/config/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Xóa thất bại");
        return;
      }
      toast.success("Đã xóa");
      await load();
    } finally {
      setActionId("");
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Webhook GitLab</h1>
        <p className="mt-1 text-muted">
          Khi ai đó comment đúng lệnh trên MR (mặc định{" "}
          <code className="text-cyan-700 dark:text-cyan-300">{defaultPhrase}</code>
          ), hệ thống tự validate với GitLab / convention / AI bạn đã chọn.
        </p>
      </div>

      <Card className="border-cyan-500/20 bg-cyan-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" />
            Cách gắn trên GitLab
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Tạo cấu hình bên dưới → copy URL + Secret token</li>
            <li>
              GitLab Project → Settings → Webhooks → URL:{" "}
              <code className="break-all text-foreground">{webhookUrl || "(set AUTH_URL)"}</code>
            </li>
            <li>Secret token = secret trong app · Trigger: <Badge>Comments</Badge></li>
            <li>
              Trên MR, comment đúng lệnh (vd:{" "}
              <code className="text-foreground">{defaultPhrase}</code>)
            </li>
          </ol>
          {webhookUrl && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyText(webhookUrl, "URL")}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy webhook URL
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Tạo cấu hình
            </CardTitle>
            <CardDescription>
              Default dùng khi auto validate từ comment trigger
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Tên cấu hình"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="space-y-1.5">
              <label className="text-sm text-muted">Lệnh trigger (khớp đúng)</label>
              <Input
                value={triggerPhrase}
                onChange={(e) => setTriggerPhrase(e.target.value)}
                placeholder={defaultPhrase}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-muted">GitLab connection</label>
              <select
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
              >
                <option value="">Chọn connection</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.host}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-muted">AI provider (optional)</label>
              <select
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
              >
                <option value="">Mặc định / failover</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.provider} · {p.model ?? "default"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted">Convention categories</label>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                {categories.length === 0 ? (
                  <p className="text-xs text-muted-soft">Chưa có category</p>
                ) : (
                  categories.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(c.id)}
                        onChange={() => toggleCategory(c.id)}
                      />
                      L{c.level} — {c.name}
                    </label>
                  ))
                )}
              </div>
            </div>
            <Button onClick={createConfig} loading={saving} disabled={!connectionId}>
              {saving ? "Đang tạo..." : "Tạo webhook"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cấu hình hiện có ({configs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {configs.length === 0 ? (
              <p className="text-sm text-muted">Chưa có webhook nào.</p>
            ) : (
              <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                {configs.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-xl border border-border bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{c.name}</p>
                        <p className="mt-1 font-mono text-xs text-cyan-700 dark:text-cyan-300">
                          Trigger: {c.triggerPhrase}
                        </p>
                      </div>
                      <Badge variant={c.isEnabled ? "valid" : "high"}>
                        {c.isEnabled ? "Bật" : "Tắt"}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted">
                      <p className="break-all">
                        Secret:{" "}
                        <code className="text-foreground">{c.secret}</code>
                      </p>
                      {c.lastTriggeredAt && (
                        <p>
                          Lần chạy cuối:{" "}
                          {new Date(c.lastTriggeredAt).toLocaleString("vi-VN")}
                        </p>
                      )}
                      {c.lastSessionId && (
                        <p>
                          Session:{" "}
                          <a
                            href={`/reviews/${c.lastSessionId}`}
                            className="text-cyan-700 underline dark:text-cyan-300"
                          >
                            {c.lastSessionId.slice(0, 8)}…
                          </a>
                        </p>
                      )}
                      {c.lastError && (
                        <p className="text-red-500">Lỗi: {c.lastError}</p>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyText(c.secret, "secret")}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy secret
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleEnabled(c)}
                        loading={actionId === `toggle-${c.id}`}
                      >
                        {c.isEnabled ? "Tắt" : "Bật"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rotateSecret(c.id)}
                        loading={actionId === `rotate-${c.id}`}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Đổi secret
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => removeConfig(c.id)}
                        loading={actionId === `del-${c.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Xóa
                      </Button>
                    </div>
                    {c.isEnabled && (
                      <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Sẵn sàng nhận comment trigger
                      </p>
                    )}
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
