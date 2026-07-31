"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function AdminSharedPage() {
  const [categories, setCategories] = useState<
    Array<{
      id: string;
      name: string;
      level: number;
      isEnabled: boolean;
      files: Array<{ id: string; name: string; content: string }>;
    }>
  >([]);
  const [providers, setProviders] = useState<
    Array<{
      id: string;
      name: string;
      provider: string;
      model: string | null;
      isEnabled: boolean;
      tokensUsed: number;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [convName, setConvName] = useState("");
  const [fileName, setFileName] = useState("rules.md");
  const [fileContent, setFileContent] = useState("");
  const [aiName, setAiName] = useState("");
  const [aiProvider, setAiProvider] = useState("openai");
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, pRes] = await Promise.all([
        fetch("/api/admin/shared-conventions"),
        fetch("/api/admin/shared-ai"),
      ]);
      const cData = await cRes.json();
      const pData = await pRes.json();
      setCategories(cData.categories ?? []);
      setProviders(pData.providers ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createConvention() {
    if (!convName.trim() || !fileContent.trim()) {
      toast.error("Nhập tên category và nội dung file");
      return;
    }
    const res = await fetch("/api/admin/shared-conventions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: convName,
        level: 1,
        files: [{ name: fileName || "rules.md", content: fileContent }],
      }),
    });
    if (!res.ok) {
      toast.error("Tạo convention thất bại");
      return;
    }
    toast.success("Đã tạo shared convention");
    setConvName("");
    setFileContent("");
    await load();
  }

  async function deleteConvention(id: string) {
    if (!confirm("Xóa shared convention?")) return;
    await fetch(`/api/admin/shared-conventions/${id}`, { method: "DELETE" });
    toast.success("Đã xóa");
    await load();
  }

  async function createAi() {
    if (!aiName.trim() || !aiKey.trim()) {
      toast.error("Nhập tên và API key");
      return;
    }
    const res = await fetch("/api/admin/shared-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: aiName,
        provider: aiProvider,
        apiKey: aiKey,
        model: aiModel || null,
      }),
    });
    if (!res.ok) {
      toast.error("Tạo shared AI thất bại");
      return;
    }
    toast.success("Đã tạo shared AI provider");
    setAiName("");
    setAiKey("");
    setAiModel("");
    await load();
  }

  async function deleteAi(id: string) {
    if (!confirm("Xóa shared AI provider?")) return;
    await fetch(`/api/admin/shared-ai/${id}`, { method: "DELETE" });
    toast.success("Đã xóa");
    await load();
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shared conventions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Tên category"
            value={convName}
            onChange={(e) => setConvName(e.target.value)}
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
          <Button onClick={() => void createConvention()}>Thêm convention</Button>
          <div className="space-y-2 pt-2">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted">
                    {c.files.length} file · {c.isEnabled ? "bật" : "tắt"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void deleteConvention(c.id)}
                >
                  Xóa
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shared AI providers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
          <Button onClick={() => void createAi()}>Thêm AI provider</Button>
          <div className="space-y-2 pt-2">
            {providers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {p.name} · {p.provider}
                  </p>
                  <p className="text-xs text-muted">
                    {p.model ?? "default"} · used {p.tokensUsed.toLocaleString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void deleteAi(p.id)}
                >
                  Xóa
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
