"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/ui/skeleton";
import {
  AI_PROVIDER_GROUPS,
  getDefaultBaseUrl,
  getDefaultModel,
  getProviderMeta,
  requiresBaseUrl,
  isApiKeyOptional,
  type AiProviderMeta,
  type AiProviderName,
} from "@/lib/ai/provider-registry";
import { ModelSelect } from "@/components/settings/model-select";
import { CheckCircle2, Pencil, Star, Trash2, X } from "lucide-react";
import { StarRating } from "@/components/ui/star-rating";
import type { StarScore } from "@/lib/ai/model-rating";

interface ProviderRatingInfo {
  overallStars: StarScore;
  capabilityStars: StarScore;
  performanceStars: StarScore | null;
  label: string;
  reason: string;
  sampleSize: number;
}

interface Provider {
  id: string;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  tokensUsed: number;
  tokenLimit: number | null;
  remaining: number | null;
  priority: number;
  isDefault: boolean;
  isEnabled: boolean;
  rating?: ProviderRatingInfo | null;
}

interface ProviderForm {
  provider: AiProviderName;
  apiKey: string;
  baseUrl: string;
  model: string;
  tokenLimit: string;
  priority: string;
  isDefault: boolean;
  isEnabled: boolean;
}

const emptyForm = (priority = 0, provider: AiProviderName = "openai"): ProviderForm => ({
  provider,
  apiKey: "",
  baseUrl: getDefaultBaseUrl(provider) ?? "",
  model: getDefaultModel(provider),
  tokenLimit: "",
  priority: String(priority),
  isDefault: false,
  isEnabled: true,
});

export default function AiSettingsPage() {
  const [registry, setRegistry] = useState<AiProviderMeta[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ProviderForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedMeta = useMemo(
    () => getProviderMeta(form.provider),
    [form.provider],
  );

  const showBaseUrl = selectedMeta
    ? requiresBaseUrl(form.provider) || !!selectedMeta.defaultBaseUrl
    : false;

  const apiKeyOptional = isApiKeyOptional(form.provider);

  async function load() {
    try {
      const [listRes, regRes] = await Promise.all([
        fetch("/api/ai/providers"),
        fetch("/api/ai/providers/registry"),
      ]);

      if (!listRes.ok) {
        const err = await listRes.json().catch(() => ({}));
        setError(
          typeof err.error === "string"
            ? err.error
            : "Không tải được danh sách provider. Hãy restart dev server và chạy: npx prisma generate",
        );
      } else {
        const listData = await listRes.json();
        setProviders(listData.providers ?? []);
      }

      if (regRes.ok) {
        const regData = await regRes.json();
        setRegistry(regData.providers ?? []);
      }
    } catch {
      setError("Lỗi kết nối API. Thử restart dev server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function changeProvider(provider: AiProviderName) {
    setForm((f) => ({
      ...f,
      provider,
      baseUrl: getDefaultBaseUrl(provider) ?? "",
      model: getDefaultModel(provider),
      apiKey: "",
    }));
    setError("");
    setMessage("");
  }

  function resetForm() {
    setForm(emptyForm(providers.length));
    setEditingId(null);
    setError("");
    setMessage("");
  }

  function startEdit(p: Provider) {
    const providerId = p.provider as AiProviderName;
    setEditingId(p.id);
    setForm({
      provider: providerId,
      apiKey: "",
      baseUrl: p.baseUrl ?? getDefaultBaseUrl(providerId) ?? "",
      model: p.model ?? getDefaultModel(providerId),
      tokenLimit: p.tokenLimit ? String(p.tokenLimit) : "",
      priority: String(p.priority),
      isDefault: p.isDefault,
      isEnabled: p.isEnabled,
    });
    setError("");
    setMessage("");
  }

  function buildPayload() {
    return {
      provider: form.provider,
      apiKey: form.apiKey || undefined,
      baseUrl: showBaseUrl ? form.baseUrl || null : null,
      model: form.model || undefined,
      tokenLimit: form.tokenLimit ? Number(form.tokenLimit) : null,
      priority: Number(form.priority) || 0,
      isDefault: form.isDefault,
      isEnabled: form.isEnabled,
    };
  }

  async function testConnection() {
    if (!apiKeyOptional && !form.apiKey) {
      setError("Nhập API key để kiểm tra kết nối");
      return;
    }
    if (showBaseUrl && requiresBaseUrl(form.provider) && !form.baseUrl) {
      setError("Nhập Base URL để kiểm tra kết nối");
      return;
    }
    if (!form.model.trim()) {
      setError("Vui lòng chọn hoặc nhập model");
      return;
    }

    setTesting(true);
    setError("");
    setMessage("");

    const res = await fetch("/api/ai/providers/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });

    const data = await res.json();
    setTesting(false);

    if (!res.ok) {
      setError(data.error ?? "Kiểm tra kết nối thất bại");
      return;
    }

    setMessage(data.message ?? "Kết nối thành công");
  }

  async function saveProvider() {
    if (!editingId && !apiKeyOptional && !form.apiKey) {
      setError("API key là bắt buộc khi thêm mới");
      return;
    }
    if (showBaseUrl && requiresBaseUrl(form.provider) && !form.baseUrl) {
      setError("Base URL là bắt buộc cho provider này");
      return;
    }

    if (!form.model.trim()) {
      setError("Vui lòng chọn hoặc nhập model");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const payload = buildPayload();
    const url = editingId ? `/api/ai/providers/${editingId}` : "/api/ai/providers";
    const method = editingId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        editingId
          ? payload
          : { ...payload, isDefault: form.isDefault || providers.length === 0 },
      ),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Lưu thất bại");
      return;
    }

    setMessage(editingId ? "Cập nhật provider thành công" : "Thêm provider thành công");
    resetForm();
    load();
  }

  async function deleteProvider(id: string) {
    if (!confirm("Xóa AI provider này?")) return;

    const res = await fetch(`/api/ai/providers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Xóa thất bại");
      return;
    }

    if (editingId === id) resetForm();
    load();
  }

  async function setReviewDefault(id: string) {
    setError("");
    setMessage("");

    const res = await fetch(`/api/ai/providers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Đặt mặc định thất bại");
      return;
    }

    setMessage("Đã chọn provider này làm mặc định khi review");
    load();
  }

  function getLabel(id: string) {
    return getProviderMeta(id)?.label ?? id;
  }

  const groupedRegistry = useMemo(() => {
    const groups = Object.keys(AI_PROVIDER_GROUPS) as Array<keyof typeof AI_PROVIDER_GROUPS>;
    return groups
      .map((group) => ({
        group,
        label: AI_PROVIDER_GROUPS[group],
        items: registry.filter((p) => p.group === group),
      }))
      .filter((g) => g.items.length > 0);
  }, [registry]);

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">AI Providers</h1>
        <p className="mt-1 text-slate-400">
          Hỗ trợ OpenAI, Claude, Gemini, DeepSeek, Groq, Cerebras, OpenRouter, Ollama, Cursor...
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{editingId ? "Sửa provider" : "Thêm provider"}</CardTitle>
              <CardDescription>{registry.length} loại provider khả dụng</CardDescription>
            </div>
            {editingId && (
              <Button variant="ghost" size="sm" onClick={resetForm}>
                <X className="h-4 w-4" />
                Hủy
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white"
              value={form.provider}
              onChange={(e) => changeProvider(e.target.value as AiProviderName)}
            >
              {groupedRegistry.map((group) => (
                <optgroup key={group.group} label={group.label}>
                  {group.items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {selectedMeta?.description && (
              <p className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-100/90">
                {selectedMeta.description}
              </p>
            )}

            {showBaseUrl && (
              <Input
                placeholder={
                  form.provider === "gemini"
                    ? "https://generativelanguage.googleapis.com/v1beta/openai/"
                    : "Base URL (vd: https://api.openai.com/v1)"
                }
                value={form.baseUrl}
                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              />
            )}

            <Input
              type="password"
              placeholder={
                editingId
                  ? apiKeyOptional
                    ? "API Key (tùy chọn)"
                    : "API Key (để trống nếu không đổi)"
                  : apiKeyOptional
                    ? "API Key (tùy chọn cho Ollama)"
                    : "API Key"
              }
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
            />
            <div className="space-y-1.5">
              <label className="text-sm text-slate-400">Model</label>
              <ModelSelect
                provider={form.provider}
                value={form.model}
                onChange={(model) => setForm((f) => ({ ...f, model }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="number"
                placeholder="Token limit"
                value={form.tokenLimit}
                onChange={(e) => setForm((f) => ({ ...f, tokenLimit: e.target.value }))}
              />
              <Input
                type="number"
                placeholder="Priority"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              />
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                  className="rounded border-white/20"
                />
                Mặc định
              </label>
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={form.isEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, isEnabled: e.target.checked }))}
                  className="rounded border-white/20"
                />
                Bật
              </label>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            {message && (
              <p className="flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                {message}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={testConnection}
                disabled={!apiKeyOptional && !form.apiKey}
                loading={testing}
              >
                {testing ? "Đang kiểm tra..." : "Kiểm tra kết nối"}
              </Button>
              <Button
                onClick={saveProvider}
                disabled={!editingId && !apiKeyOptional && !form.apiKey}
                loading={saving}
              >
                {saving
                  ? "Đang lưu..."
                  : editingId
                    ? "Kiểm tra & cập nhật"
                    : "Kiểm tra & lưu"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Providers đang hoạt động</CardTitle>
            <CardDescription>{providers.length} provider đã cấu hình</CardDescription>
          </CardHeader>
          <CardContent>
            {providers.length === 0 ? (
              <p className="text-sm text-slate-400">Chưa cấu hình AI provider.</p>
            ) : (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className={`rounded-xl border p-4 transition ${
                      editingId === p.id
                        ? "border-violet-500/50 bg-violet-500/5"
                        : "border-white/10 bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{getLabel(p.provider)}</p>
                        <p className="truncate text-sm text-slate-400">{p.model ?? "default model"}</p>
                        {p.rating && (
                          <div className="mt-2 space-y-0.5">
                            <StarRating
                              stars={p.rating.overallStars}
                              showValue
                              label={p.rating.label}
                            />
                            <p className="text-[11px] text-slate-500" title={p.rating.reason}>
                              {p.rating.reason}
                            </p>
                          </div>
                        )}
                        {p.baseUrl && (
                          <p className="mt-1 truncate font-mono text-xs text-slate-500">{p.baseUrl}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        {p.isDefault && <Badge variant="violet">Default</Badge>}
                        {!p.isEnabled && <Badge variant="high">Tắt</Badge>}
                        <Badge>Priority {p.priority}</Badge>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-4 text-sm">
                      <span className="text-slate-400">
                        Đã dùng:{" "}
                        <span className="text-white">{p.tokensUsed.toLocaleString()}</span>
                      </span>
                      <span className="text-slate-400">
                        Còn lại:{" "}
                        <span className="text-emerald-300">
                          {p.remaining !== null ? p.remaining.toLocaleString() : "∞"}
                        </span>
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {!p.isDefault && p.isEnabled && (
                        <Button variant="secondary" size="sm" onClick={() => setReviewDefault(p.id)}>
                          <Star className="h-3.5 w-3.5" />
                          Dùng khi review
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => startEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Sửa
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => deleteProvider(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
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
