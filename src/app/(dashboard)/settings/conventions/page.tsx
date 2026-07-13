"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { Eye, FileText, User, X } from "lucide-react";

interface ConventionFile {
  id: string;
  name: string;
  content: string;
}

interface Category {
  id: string;
  name: string;
  level: number;
  files: ConventionFile[];
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
  const [previewFile, setPreviewFile] = useState<ConventionFile | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingPreview, setSavingPreview] = useState(false);

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

  function openPreview(file: ConventionFile) {
    setPreviewFile(file);
    setEditName(file.name);
    setEditContent(file.content);
  }

  function closePreview() {
    setPreviewFile(null);
    setEditName("");
    setEditContent("");
  }

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

  async function savePreview() {
    if (!previewFile) return;
    if (!editName.trim() || !editContent.trim()) {
      toast.error("Tên file và nội dung không được trống");
      return;
    }

    setSavingPreview(true);
    try {
      const res = await fetch("/api/conventions/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: previewFile.id,
          name: editName.trim(),
          content: editContent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Cập nhật thất bại");
        return;
      }
      toast.success("Đã cập nhật file convention");
      closePreview();
      await load();
    } catch {
      toast.error("Lỗi kết nối khi cập nhật file");
    } finally {
      setSavingPreview(false);
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
      if (previewFile?.id === id) closePreview();
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
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <Card className="flex max-h-[90vh] w-full max-w-3xl flex-col border-violet-500/30 shadow-2xl">
            <CardHeader className="flex flex-row items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 shrink-0 text-cyan-700 dark:text-cyan-400" />
                  <span className="truncate">Preview / Sửa convention</span>
                </CardTitle>
                <CardDescription className="truncate">
                  {previewFile.name}
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={closePreview} aria-label="Đóng">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="tên-file.md"
              />
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-0 flex-1 font-mono text-xs"
                style={{ minHeight: "320px" }}
              />
              <div className="flex flex-wrap justify-end gap-2 shrink-0">
                <Button variant="secondary" onClick={closePreview}>
                  Đóng
                </Button>
                <Button onClick={savePreview} loading={savingPreview}>
                  {savingPreview ? "Đang lưu..." : "Lưu thay đổi"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold text-foreground">Convention Rules</h1>
        <p className="mt-1 text-muted">
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
              className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
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
          <CardDescription>
            Nhấn tên file để xem / sửa nội dung. Danh sách dài cuộn trong khung.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-sm text-muted">Chưa có convention nào.</p>
          ) : (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              {categories.map((c) => (
                <div key={c.id} className="rounded-xl border border-border p-4">
                  <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
                    <Badge variant="violet" className="shrink-0">
                      Level {c.level}
                    </Badge>
                    <h3 className="min-w-0 truncate font-medium">{c.name}</h3>
                    <span className="shrink-0 text-sm text-muted-soft">{c.files.length} files</span>
                  </div>
                  {c.user && (
                    <p className="mb-3 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        Tạo bởi: {c.user.name || c.user.email}
                      </span>
                    </p>
                  )}
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {c.files.length === 0 ? (
                      <p className="text-xs text-muted-soft">Chưa có file.</p>
                    ) : (
                      c.files.map((f) => (
                        <div
                          key={f.id}
                          className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm"
                        >
                          <button
                            type="button"
                            onClick={() => openPreview(f)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left hover:opacity-90"
                            title="Xem / sửa nội dung"
                          >
                            <Eye className="h-3.5 w-3.5 shrink-0 text-muted-soft" />
                            <span className="min-w-0 truncate font-mono text-cyan-700 dark:text-cyan-300">
                              {f.name}
                            </span>
                          </button>
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
                      ))
                    )}
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
