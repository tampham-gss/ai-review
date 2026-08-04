"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Pencil, Power, Trash2, X } from "lucide-react";

type SharedFile = { id: string; name: string; content: string };

type SharedCategory = {
  id: string;
  name: string;
  level: number;
  isEnabled: boolean;
  files: SharedFile[];
};

type SharedProvider = {
  id: string;
  name: string;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  isEnabled: boolean;
  priority: number;
  tokenLimit: number | null;
  tokensUsed: number;
};

export default function AdminSharedPage() {
  const [categories, setCategories] = useState<SharedCategory[]>([]);
  const [providers, setProviders] = useState<SharedProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");

  // Create convention
  const [convName, setConvName] = useState("");
  const [convLevel, setConvLevel] = useState("1");
  const [fileName, setFileName] = useState("rules.md");
  const [fileContent, setFileContent] = useState("");

  // Edit convention
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editConvName, setEditConvName] = useState("");
  const [editConvLevel, setEditConvLevel] = useState("1");
  const [editFileName, setEditFileName] = useState("rules.md");
  const [editFileContent, setEditFileContent] = useState("");

  // Create AI
  const [aiName, setAiName] = useState("");
  const [aiProvider, setAiProvider] = useState("openai");
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiPriority, setAiPriority] = useState("0");

  // Edit AI
  const [editingAiId, setEditingAiId] = useState<string | null>(null);
  const [editAiName, setEditAiName] = useState("");
  const [editAiProvider, setEditAiProvider] = useState("openai");
  const [editAiKey, setEditAiKey] = useState("");
  const [editAiModel, setEditAiModel] = useState("");
  const [editAiBaseUrl, setEditAiBaseUrl] = useState("");
  const [editAiPriority, setEditAiPriority] = useState("0");
  const [editAiTokenLimit, setEditAiTokenLimit] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, pRes] = await Promise.all([
        fetch("/api/admin/shared-conventions"),
        fetch("/api/admin/shared-ai"),
      ]);
      const cData = await cRes.json();
      const pData = await pRes.json();
      if (!cRes.ok) {
        toast.error(
          typeof cData.error === "string" ? cData.error : "Không tải convention",
        );
      }
      if (!pRes.ok) {
        toast.error(
          typeof pData.error === "string" ? pData.error : "Không tải AI",
        );
      }
      setCategories(cData.categories ?? []);
      setProviders(pData.providers ?? []);
    } catch {
      toast.error("Lỗi kết nối khi tải Shared");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEditConv(c: SharedCategory) {
    setEditingConvId(c.id);
    setEditConvName(c.name);
    setEditConvLevel(String(c.level));
    const first = c.files[0];
    setEditFileName(first?.name ?? "rules.md");
    setEditFileContent(first?.content ?? "");
  }

  function cancelEditConv() {
    setEditingConvId(null);
  }

  function startEditAi(p: SharedProvider) {
    setEditingAiId(p.id);
    setEditAiName(p.name);
    setEditAiProvider(p.provider);
    setEditAiKey("");
    setEditAiModel(p.model ?? "");
    setEditAiBaseUrl(p.baseUrl ?? "");
    setEditAiPriority(String(p.priority ?? 0));
    setEditAiTokenLimit(p.tokenLimit != null ? String(p.tokenLimit) : "");
  }

  function cancelEditAi() {
    setEditingAiId(null);
    setEditAiKey("");
  }

  async function createConvention() {
    if (!convName.trim() || !fileContent.trim()) {
      toast.error("Nhập tên category và nội dung file");
      return;
    }
    setActionId("create-conv");
    try {
      const res = await fetch("/api/admin/shared-conventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: convName.trim(),
          level: Number(convLevel) || 1,
          files: [{ name: fileName || "rules.md", content: fileContent }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Tạo thất bại");
        return;
      }
      toast.success("Đã tạo shared convention");
      setConvName("");
      setFileContent("");
      await load();
    } finally {
      setActionId("");
    }
  }

  async function saveConvention() {
    if (!editingConvId) return;
    if (!editConvName.trim() || !editFileContent.trim()) {
      toast.error("Tên và nội dung file không được trống");
      return;
    }
    setActionId(`save-conv-${editingConvId}`);
    try {
      const res = await fetch(`/api/admin/shared-conventions/${editingConvId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editConvName.trim(),
          level: Number(editConvLevel) || 1,
          files: [
            {
              name: editFileName.trim() || "rules.md",
              content: editFileContent,
            },
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Cập nhật thất bại");
        return;
      }
      toast.success("Đã cập nhật convention");
      setEditingConvId(null);
      await load();
    } finally {
      setActionId("");
    }
  }

  async function toggleConvention(c: SharedCategory) {
    setActionId(`toggle-conv-${c.id}`);
    try {
      const res = await fetch(`/api/admin/shared-conventions/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !c.isEnabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Toggle thất bại");
        return;
      }
      toast.success(c.isEnabled ? "Đã tắt convention" : "Đã bật convention");
      await load();
    } finally {
      setActionId("");
    }
  }

  async function deleteConvention(id: string) {
    if (!confirm("Xóa shared convention?")) return;
    setActionId(`del-conv-${id}`);
    try {
      const res = await fetch(`/api/admin/shared-conventions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Xóa thất bại");
        return;
      }
      toast.success("Đã xóa");
      if (editingConvId === id) cancelEditConv();
      await load();
    } finally {
      setActionId("");
    }
  }

  async function createAi() {
    if (!aiName.trim() || !aiKey.trim()) {
      toast.error("Nhập tên và API key");
      return;
    }
    setActionId("create-ai");
    try {
      const res = await fetch("/api/admin/shared-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: aiName.trim(),
          provider: aiProvider.trim(),
          apiKey: aiKey,
          model: aiModel.trim() || null,
          baseUrl: aiBaseUrl.trim() || null,
          priority: Number(aiPriority) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Tạo thất bại");
        return;
      }
      toast.success("Đã tạo shared AI provider");
      setAiName("");
      setAiKey("");
      setAiModel("");
      setAiBaseUrl("");
      setAiPriority("0");
      await load();
    } finally {
      setActionId("");
    }
  }

  async function saveAi() {
    if (!editingAiId) return;
    if (!editAiName.trim()) {
      toast.error("Tên không được trống");
      return;
    }
    setActionId(`save-ai-${editingAiId}`);
    try {
      const res = await fetch(`/api/admin/shared-ai/${editingAiId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editAiName.trim(),
          provider: editAiProvider.trim(),
          ...(editAiKey.trim() ? { apiKey: editAiKey.trim() } : {}),
          model: editAiModel.trim() || null,
          baseUrl: editAiBaseUrl.trim() || null,
          priority: Number(editAiPriority) || 0,
          tokenLimit: editAiTokenLimit.trim()
            ? Number(editAiTokenLimit)
            : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Cập nhật thất bại");
        return;
      }
      toast.success("Đã cập nhật AI provider");
      cancelEditAi();
      await load();
    } finally {
      setActionId("");
    }
  }

  async function toggleAi(p: SharedProvider) {
    setActionId(`toggle-ai-${p.id}`);
    try {
      const res = await fetch(`/api/admin/shared-ai/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !p.isEnabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Toggle thất bại");
        return;
      }
      toast.success(p.isEnabled ? "Đã tắt provider" : "Đã bật provider");
      await load();
    } finally {
      setActionId("");
    }
  }

  async function deleteAi(id: string) {
    if (!confirm("Xóa shared AI provider?")) return;
    setActionId(`del-ai-${id}`);
    try {
      const res = await fetch(`/api/admin/shared-ai/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Xóa thất bại");
        return;
      }
      toast.success("Đã xóa");
      if (editingAiId === id) cancelEditAi();
      await load();
    } finally {
      setActionId("");
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Shared resources</h1>
        <p className="text-sm text-muted">
          Convention và AI dùng chung toàn hệ thống — bật/tắt hoặc chỉnh sửa nội
          dung.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shared conventions</CardTitle>
            <CardDescription>
              Tự merge vào validate khi đang bật
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!editingConvId ? (
              <>
                <Input
                  placeholder="Tên category"
                  value={convName}
                  onChange={(e) => setConvName(e.target.value)}
                />
                <Input
                  type="number"
                  min={1}
                  max={10}
                  placeholder="Level"
                  value={convLevel}
                  onChange={(e) => setConvLevel(e.target.value)}
                />
                <Input
                  placeholder="Tên file"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                />
                <Textarea
                  placeholder="Nội dung markdown convention..."
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="min-h-[120px]"
                />
                <Button
                  onClick={() => void createConvention()}
                  loading={actionId === "create-conv"}
                >
                  Thêm convention
                </Button>
              </>
            ) : (
              <div className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Sửa convention</p>
                  <Button variant="ghost" size="sm" onClick={cancelEditConv}>
                    <X className="h-4 w-4" />
                    Hủy
                  </Button>
                </div>
                <Input
                  placeholder="Tên category"
                  value={editConvName}
                  onChange={(e) => setEditConvName(e.target.value)}
                />
                <Input
                  type="number"
                  min={1}
                  max={10}
                  placeholder="Level"
                  value={editConvLevel}
                  onChange={(e) => setEditConvLevel(e.target.value)}
                />
                <Input
                  placeholder="Tên file"
                  value={editFileName}
                  onChange={(e) => setEditFileName(e.target.value)}
                />
                <Textarea
                  value={editFileContent}
                  onChange={(e) => setEditFileContent(e.target.value)}
                  className="min-h-[160px] font-mono text-xs"
                />
                <Button
                  onClick={() => void saveConvention()}
                  loading={actionId === `save-conv-${editingConvId}`}
                >
                  Lưu thay đổi
                </Button>
              </div>
            )}

            <div className="max-h-[50vh] space-y-2 overflow-y-auto pt-2">
              {categories.length === 0 ? (
                <p className="text-sm text-muted">Chưa có shared convention.</p>
              ) : (
                categories.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{c.name}</p>
                          <Badge variant={c.isEnabled ? "valid" : "high"}>
                            {c.isEnabled ? "Bật" : "Tắt"}
                          </Badge>
                          <Badge>L{c.level}</Badge>
                        </div>
                        <p className="text-xs text-muted">
                          {c.files.length} file
                          {c.files[0] ? ` · ${c.files[0].name}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void toggleConvention(c)}
                          loading={actionId === `toggle-conv-${c.id}`}
                          title={c.isEnabled ? "Tắt" : "Bật"}
                        >
                          <Power className="h-3.5 w-3.5" />
                          {c.isEnabled ? "Tắt" : "Bật"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEditConv(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Sửa
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void deleteConvention(c.id)}
                          loading={actionId === `del-conv-${c.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shared AI providers</CardTitle>
            <CardDescription>
              User có thể dùng khi provider cá nhân hết / không có
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!editingAiId ? (
              <>
                <Input
                  placeholder="Tên hiển thị"
                  value={aiName}
                  onChange={(e) => setAiName(e.target.value)}
                />
                <Input
                  placeholder="Provider (openai/anthropic/gemini/...)"
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value)}
                />
                <Input
                  placeholder="API key"
                  type="password"
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                />
                <Input
                  placeholder="Model (optional)"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                />
                <Input
                  placeholder="Base URL (optional)"
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                />
                <Input
                  type="number"
                  placeholder="Priority"
                  value={aiPriority}
                  onChange={(e) => setAiPriority(e.target.value)}
                />
                <Button
                  onClick={() => void createAi()}
                  loading={actionId === "create-ai"}
                >
                  Thêm AI provider
                </Button>
              </>
            ) : (
              <div className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Sửa AI provider</p>
                  <Button variant="ghost" size="sm" onClick={cancelEditAi}>
                    <X className="h-4 w-4" />
                    Hủy
                  </Button>
                </div>
                <Input
                  placeholder="Tên hiển thị"
                  value={editAiName}
                  onChange={(e) => setEditAiName(e.target.value)}
                />
                <Input
                  placeholder="Provider"
                  value={editAiProvider}
                  onChange={(e) => setEditAiProvider(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="API key mới (để trống nếu giữ nguyên)"
                  value={editAiKey}
                  onChange={(e) => setEditAiKey(e.target.value)}
                />
                <Input
                  placeholder="Model"
                  value={editAiModel}
                  onChange={(e) => setEditAiModel(e.target.value)}
                />
                <Input
                  placeholder="Base URL"
                  value={editAiBaseUrl}
                  onChange={(e) => setEditAiBaseUrl(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Priority"
                    value={editAiPriority}
                    onChange={(e) => setEditAiPriority(e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder="Token limit"
                    value={editAiTokenLimit}
                    onChange={(e) => setEditAiTokenLimit(e.target.value)}
                  />
                </div>
                <Button
                  onClick={() => void saveAi()}
                  loading={actionId === `save-ai-${editingAiId}`}
                >
                  Lưu thay đổi
                </Button>
              </div>
            )}

            <div className="max-h-[50vh] space-y-2 overflow-y-auto pt-2">
              {providers.length === 0 ? (
                <p className="text-sm text-muted">Chưa có shared AI.</p>
              ) : (
                providers.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            {p.name} · {p.provider}
                          </p>
                          <Badge variant={p.isEnabled ? "valid" : "high"}>
                            {p.isEnabled ? "Bật" : "Tắt"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted">
                          {p.model ?? "default"} · priority {p.priority} · used{" "}
                          {p.tokensUsed.toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void toggleAi(p)}
                          loading={actionId === `toggle-ai-${p.id}`}
                        >
                          <Power className="h-3.5 w-3.5" />
                          {p.isEnabled ? "Tắt" : "Bật"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEditAi(p)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Sửa
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void deleteAi(p.id)}
                          loading={actionId === `del-ai-${p.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
