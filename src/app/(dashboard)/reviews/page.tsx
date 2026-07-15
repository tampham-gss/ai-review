"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import {
  ValidateProgressPanel,
  ValidateAbortedError,
  applyProgressEvent,
  initialProgressState,
  streamValidate,
} from "@/components/reviews/validate-progress";
import { AiProviderPicker } from "@/components/reviews/ai-provider-picker";
import { AlertTriangle, History, Upload, Zap } from "lucide-react";

interface Connection {
  id: string;
  name: string;
  host: string;
  isDefault?: boolean;
}

interface Project {
  id: string;
  name: string;
  pathWithNamespace: string;
}

interface MR {
  iid: number;
  title: string;
  sourceBranch: string;
}

interface Category {
  id: string;
  name: string;
  level: number;
}

export default function NewReviewPage() {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const stopSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [mrs, setMrs] = useState<MR[]>([]);

  const [connectionId, setConnectionId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [mrIid, setMrIid] = useState<number | null>(null);
  const [mrTitle, setMrTitle] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<"gitlab" | "zip">("gitlab");
  const [zipBase64, setZipBase64] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(initialProgressState);
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const [connRes, catRes] = await Promise.all([
          fetch("/api/gitlab/connections"),
          fetch("/api/conventions/categories"),
        ]);
        const connData = await connRes.json();
        const catData = await catRes.json();
        const cats = catData.categories ?? [];
        setConnections(connData.connections ?? []);
        setCategories(cats);
        setSelectedCategories(cats.map((c: Category) => c.id));
        const conns = (connData.connections ?? []) as Connection[];
        const preferred = conns.find((c) => c.isDefault) ?? conns[0];
        if (preferred) setConnectionId(preferred.id);
      } catch {
        toast.error("Không tải được dữ liệu khởi tạo");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  async function loadProjects() {
    if (!connectionId) return;
    setLoadingProjects(true);
    try {
      const res = await fetch(`/api/gitlab/projects?connectionId=${connectionId}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Tải projects thất bại");
        return;
      }
      setProjects(data.projects ?? []);
      toast.success(`Đã tải ${data.projects?.length ?? 0} projects`);
    } catch {
      toast.error("Lỗi kết nối khi tải projects");
    } finally {
      setLoadingProjects(false);
    }
  }

  async function loadMrs(pid: string) {
    try {
      const res = await fetch(
        `/api/gitlab/merge-requests?connectionId=${connectionId}&projectId=${pid}`,
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Tải MR thất bại");
        return;
      }
      setMrs(data.mergeRequests ?? []);
    } catch {
      toast.error("Lỗi kết nối khi tải merge requests");
    }
  }

  function toggleCategory(id: string) {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleZipFile(file: File) {
    const buffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
    );
    setZipBase64(base64);
    setSourceType("zip");
    toast.info(`Đã chọn ZIP: ${file.name}`);
  }

  function clearStopSafetyTimer() {
    if (stopSafetyTimerRef.current) {
      clearTimeout(stopSafetyTimerRef.current);
      stopSafetyTimerRef.current = null;
    }
  }

  function stopValidate() {
    setStopping(true);
    setProgress((prev) => ({
      ...prev,
      phaseMessage: "Đang dừng validate — hủy request AI...",
    }));
    abortRef.current?.abort();

    // Nếu server/AI kẹt, vẫn mở khóa UI sau vài giây
    clearStopSafetyTimer();
    stopSafetyTimerRef.current = setTimeout(() => {
      setStopping(false);
      setRunning(false);
      setProgress((prev) => {
        if (prev.status !== "running") return prev;
        return {
          ...prev,
          status: "cancelled",
          phaseMessage: "Đã dừng validate.",
          currentComment: null,
        };
      });
      toast.info("Đã ngắt validate");
      abortRef.current = null;
    }, 6_000);
  }

  async function runValidate() {
    if (!connectionId || !projectId || !mrIid || !sourceBranch) {
      setError("Vui lòng chọn đủ GitLab project, MR và branch");
      toast.error("Vui lòng chọn đủ GitLab project, MR và branch");
      return;
    }
    if (!providerId) {
      setError("Vui lòng chọn AI provider để validate");
      toast.error("Vui lòng chọn AI provider để validate");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    clearStopSafetyTimer();

    setRunning(true);
    setStopping(false);
    setError("");
    setProgress({ ...initialProgressState, status: "running", phaseMessage: "Đang kết nối..." });
    setShowProgress(true);

    try {
      const sessionId = await streamValidate(
        {
          connectionId,
          projectId,
          projectPath,
          mrIid,
          mrTitle,
          sourceBranch,
          selectedCategoryIds: selectedCategories,
          providerId,
          sourceType,
          zipBase64: zipBase64 ?? undefined,
        },
        (event) => setProgress((prev) => applyProgressEvent(prev, event)),
        controller.signal,
      );

      if (sessionId) {
        toast.success("Validate hoàn tất");
        await new Promise((r) => setTimeout(r, 600));
        router.push(`/reviews/${sessionId}`);
      }
    } catch (err) {
      if (err instanceof ValidateAbortedError || controller.signal.aborted) {
        setProgress((prev) => ({
          ...prev,
          status: "cancelled",
          phaseMessage: err instanceof Error ? err.message : "Đã dừng validate",
          currentComment: null,
        }));
        toast.info("Đã ngắt validate");
      } else {
        const message = err instanceof Error ? err.message : "Validate thất bại";
        setError(message);
        setProgress((prev) => ({
          ...prev,
          status: "error",
          error: message,
          phaseMessage: message,
          currentComment: null,
        }));
        toast.error(message);
      }
    } finally {
      clearStopSafetyTimer();
      setRunning(false);
      setStopping(false);
      abortRef.current = null;
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <ValidateProgressPanel
        state={progress}
        visible={showProgress}
        onClose={() => setShowProgress(false)}
        onStop={stopValidate}
        stopping={stopping}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-foreground">Review mới</h1>
          <p className="mt-1 text-muted">
            Chỉ lấy comment chưa resolved trên MR đã chọn.
          </p>
        </div>
        <Link href="/reviews/history">
          <Button variant="secondary">
            <History className="h-4 w-4" />
            Lịch sử review
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI Provider</CardTitle>
          <CardDescription>Chọn model dùng để validate comment trên MR này.</CardDescription>
        </CardHeader>
        <CardContent>
          <AiProviderPicker value={providerId} onChange={setProviderId} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. GitLab & MR</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              className="h-10 w-full truncate rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isDefault ? "★ " : ""}
                  {c.name} — {c.host}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={loadProjects} loading={loadingProjects}>
              {loadingProjects ? "Đang tải..." : "Tải projects"}
            </Button>
            <select
              className="h-10 w-full truncate rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
              value={projectId}
              onChange={(e) => {
                const p = projects.find((x) => x.id === e.target.value);
                setProjectId(e.target.value);
                setProjectPath(p?.pathWithNamespace ?? "");
                loadMrs(e.target.value);
              }}
            >
              <option value="">Chọn project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.pathWithNamespace}
                </option>
              ))}
            </select>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border">
              <select
                className="h-10 w-full truncate rounded-xl border-0 bg-surface px-3 text-sm text-foreground"
                value={mrIid ?? ""}
                onChange={(e) => {
                  const iid = Number(e.target.value);
                  const mr = mrs.find((m) => m.iid === iid);
                  setMrIid(iid);
                  setMrTitle(mr?.title ?? "");
                  setSourceBranch(mr?.sourceBranch ?? "");
                }}
              >
                <option value="">Chọn Merge Request</option>
                {mrs.map((mr) => (
                  <option key={mr.iid} value={mr.iid}>
                    !{mr.iid} — {mr.title}
                  </option>
                ))}
              </select>
            </div>
            <Input value={sourceBranch} readOnly placeholder="Source branch" className="truncate" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Source & Convention</CardTitle>
            <CardDescription>
              Mặc định lấy từ GitLab API. Kéo thả ZIP để override.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-8 transition hover:border-violet-500/50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleZipFile(file);
              }}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".zip";
                input.onchange = () => {
                  const file = input.files?.[0];
                  if (file) handleZipFile(file);
                };
                input.click();
              }}
            >
              <Upload className="mb-2 h-8 w-8 text-violet-400" />
              <p className="text-sm text-muted">Kéo thả source ZIP vào đây</p>
              <p className="text-xs text-muted-soft">Hoặc click để chọn file</p>
            </div>

            {sourceType === "zip" && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="min-w-0 break-words">
                  Đang dùng source ZIP upload — có thể không khớp commit trên GitLab.
                  Hãy đảm bảo ZIP đúng branch <strong>{sourceBranch}</strong>.
                </p>
              </div>
            )}

            {sourceType === "gitlab" && (
              <p className="text-sm text-emerald-400">✓ Sẽ lấy source trực tiếp từ GitLab API</p>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted">
                Convention (mặc định đã chọn hết — bỏ chọn nếu không cần)
              </p>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-border p-2">
                <div className="flex flex-wrap gap-2">
                  {categories.length === 0 ? (
                    <p className="text-xs text-muted-soft">Chưa có convention — vào Settings để upload.</p>
                  ) : (
                    categories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCategory(c.id)}
                        title={`L${c.level} ${c.name}`}
                        className={`max-w-full truncate rounded-full px-3 py-1 text-xs transition ${
                          selectedCategories.includes(c.id)
                            ? "bg-violet-500/30 text-violet-200 ring-1 ring-violet-500/50"
                            : "bg-surface text-muted hover:bg-surface-hover"
                        }`}
                      >
                        L{c.level} {c.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium text-foreground">3. Chạy validate</p>
            <p className="text-sm text-muted">
              Chỉ quét comment chưa resolve; ưu tiên MR diff + file/line trong note.
            </p>
            {error && <p className="mt-2 break-words text-sm text-red-400">{error}</p>}
          </div>
          <Button
            size="lg"
            className="shrink-0"
            onClick={runValidate}
            disabled={running || !providerId}
            loading={running}
          >
            {!running && <Zap className="h-4 w-4" />}
            {running ? "Đang quét..." : "Bắt đầu validate"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
