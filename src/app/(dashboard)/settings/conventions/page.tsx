"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { User } from "lucide-react";

interface Category {
  id: string;
  name: string;
  level: number;
  files: Array<{ id: string; name: string; content: string }>;
  user?: { id: string; name: string | null; email: string };
}

export default function ConventionsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [catName, setCatName] = useState("");
  const [catLevel, setCatLevel] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingFile, setAddingFile] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/conventions/categories");
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Không tải được convention");
        return;
      }
      setCategories(data.categories ?? []);
    } catch {
      toast.error("Lỗi kết nối khi tải convention");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addCategory() {
    setAddingCategory(true);
    try {
      const res = await fetch("/api/conventions/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: catName, level: catLevel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Thêm category thất bại");
        return;
      }
      setCatName("");
      toast.success("Đã thêm category");
      await load();
    } catch {
      toast.error("Lỗi kết nối khi thêm category");
    } finally {
      setAddingCategory(false);
    }
  }

  async function addFile() {
    if (!selectedCategory) return;
    setAddingFile(true);
    try {
      const res = await fetch("/api/conventions/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: selectedCategory,
          name: fileName,
          content: fileContent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Lưu file thất bại");
        return;
      }
      setFileName("");
      setFileContent("");
      toast.success("Đã lưu file convention");
      await load();
    } catch {
      toast.error("Lỗi kết nối khi lưu file");
    } finally {
      setAddingFile(false);
    }
  }

  async function deleteFile(id: string) {
    setDeletingFileId(id);
    try {
      const res = await fetch(`/api/conventions/files?id=${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Xóa file thất bại");
        return;
      }
      toast.success("Đã xóa file convention");
      await load();
    } catch {
      toast.error("Lỗi kết nối khi xóa file");
    } finally {
      setDeletingFileId("");
    }
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
            <Button onClick={addCategory} disabled={!catName} loading={addingCategory}>
              {addingCategory ? "Đang thêm..." : "Thêm category"}
            </Button>
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
            <Button
              onClick={addFile}
              disabled={!selectedCategory || !fileName || !fileContent}
              loading={addingFile}
            >
              {addingFile ? "Đang lưu..." : "Lưu file convention"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách convention</CardTitle>
          <CardDescription>Danh sách dài sẽ cuộn trong khung, không kéo dài cả trang.</CardDescription>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có convention nào.</p>
          ) : (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              {categories.map((c) => (
                <div key={c.id} className="rounded-xl border border-white/10 p-4">
                  <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
                    <Badge variant="violet" className="shrink-0">
                      Level {c.level}
                    </Badge>
                    <h3 className="min-w-0 truncate font-medium">{c.name}</h3>
                    <span className="shrink-0 text-sm text-slate-500">{c.files.length} files</span>
                  </div>
                  {c.user && (
                    <p className="mb-3 flex min-w-0 items-center gap-1.5 text-xs text-slate-400">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        Tạo bởi: {c.user.name || c.user.email}
                      </span>
                    </p>
                  )}
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {c.files.map((f) => (
                      <div
                        key={f.id}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate font-mono text-cyan-300" title={f.name}>
                          {f.name}
                        </span>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="shrink-0"
                          onClick={() => deleteFile(f.id)}
                          loading={deletingFileId === f.id}
                        >
                          Xóa
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
