"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/ui/skeleton";

interface Category {
  id: string;
  name: string;
  level: number;
  files: Array<{ id: string; name: string; content: string }>;
}

export default function ConventionsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [catName, setCatName] = useState("");
  const [catLevel, setCatLevel] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");

  async function load() {
    const res = await fetch("/api/conventions/categories");
    const data = await res.json();
    setCategories(data.categories ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addCategory() {
    await fetch("/api/conventions/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: catName, level: catLevel }),
    });
    setCatName("");
    load();
  }

  async function addFile() {
    if (!selectedCategory) return;
    await fetch("/api/conventions/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: selectedCategory,
        name: fileName,
        content: fileContent,
      }),
    });
    setFileName("");
    setFileContent("");
    load();
  }

  async function deleteFile(id: string) {
    await fetch(`/api/conventions/files?id=${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Convention Rules</h1>
        <p className="mt-1 text-slate-400">
          Upload file .md theo level — chọn nhiều category khi validate.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Thêm category</CardTitle>
            <CardDescription>Ví dụ: Base (1), Frontend (2), React Hooks (3)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Tên category" value={catName} onChange={(e) => setCatName(e.target.value)} />
            <Input
              type="number"
              min={1}
              max={10}
              value={catLevel}
              onChange={(e) => setCatLevel(Number(e.target.value))}
            />
            <Button onClick={addCategory} disabled={!catName}>Thêm category</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upload convention .md</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">Chọn category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  L{c.level} — {c.name}
                </option>
              ))}
            </select>
            <Input placeholder="hooks-usecallback.md" value={fileName} onChange={(e) => setFileName(e.target.value)} />
            <Textarea
              placeholder="# Quy tắc useCallback..."
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className="min-h-[160px] font-mono text-xs"
            />
            <Button onClick={addFile} disabled={!selectedCategory || !fileName || !fileContent}>
              Lưu file convention
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách convention</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có convention nào.</p>
          ) : (
            categories.map((c) => (
              <div key={c.id} className="rounded-xl border border-white/10 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="violet">Level {c.level}</Badge>
                  <h3 className="font-medium">{c.name}</h3>
                  <span className="text-sm text-slate-500">{c.files.length} files</span>
                </div>
                <div className="space-y-2">
                  {c.files.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-cyan-300">{f.name}</span>
                      <Button variant="destructive" size="sm" onClick={() => deleteFile(f.id)}>
                        Xóa
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
