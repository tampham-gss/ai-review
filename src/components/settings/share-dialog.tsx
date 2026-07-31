"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { Share2, Trash2, X, Search } from "lucide-react";
import type { ResourceType } from "@/lib/shares";

interface ShareUser {
  id: string;
  name: string | null;
  email: string;
}

interface ShareRow {
  id: string;
  canEdit: boolean;
  sharedWith: ShareUser;
}

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  resourceId: string;
  resourceLabel: string;
}

export function ShareDialog({
  open,
  onClose,
  resourceType,
  resourceId,
  resourceLabel,
}: ShareDialogProps) {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShareUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [selected, setSelected] = useState<ShareUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState("");

  const loadShares = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/shares?resourceType=${encodeURIComponent(resourceType)}&resourceId=${encodeURIComponent(resourceId)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Không tải được shares");
        return;
      }
      setShares(data.shares ?? []);
    } catch {
      toast.error("Lỗi khi tải danh sách share");
    } finally {
      setLoading(false);
    }
  }, [resourceId, resourceType]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSelected(null);
    setCanEdit(false);
    loadShares();
  }, [open, loadShares]);

  useEffect(() => {
    if (!open || query.trim().length < 1) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(query.trim())}`,
        );
        const data = await res.json();
        setResults(data.users ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [open, query]);

  async function shareWithSelected() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType,
          resourceId,
          sharedWithUserId: selected.id,
          canEdit,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Share thất bại");
        return;
      }
      toast.success(`Đã share với ${selected.name || selected.email}`);
      setSelected(null);
      setQuery("");
      setResults([]);
      await loadShares();
    } catch {
      toast.error("Lỗi kết nối khi share");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCanEdit(share: ShareRow) {
    try {
      const res = await fetch(`/api/shares/${share.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canEdit: !share.canEdit }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Cập nhật thất bại");
        return;
      }
      await loadShares();
    } catch {
      toast.error("Lỗi khi cập nhật quyền");
    }
  }

  async function revoke(shareId: string) {
    setRevokingId(shareId);
    try {
      const res = await fetch(`/api/shares/${shareId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Thu hồi thất bại");
        return;
      }
      toast.success("Đã thu hồi share");
      await loadShares();
    } catch {
      toast.error("Lỗi khi thu hồi share");
    } finally {
      setRevokingId("");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Share2 className="h-5 w-5 text-cyan-700 dark:text-cyan-400" />
              Chia sẻ
            </h2>
            <p className="mt-1 truncate text-sm text-muted">{resourceLabel}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Đóng">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Tìm người dùng</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-soft" />
              <Input
                className="pl-9"
                placeholder="Email hoặc tên..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                }}
              />
            </div>
            {searching && (
              <p className="text-xs text-muted-soft">Đang tìm...</p>
            )}
            {!selected && results.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-xl border border-border">
                {results.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-surface"
                      onClick={() => {
                        setSelected(u);
                        setQuery(u.email);
                        setResults([]);
                      }}
                    >
                      <span className="font-medium">{u.name || u.email}</span>
                      {u.name && (
                        <span className="text-xs text-muted">{u.email}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 text-sm">
                Sẽ share với:{" "}
                <span className="font-medium">
                  {selected.name || selected.email}
                </span>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={canEdit}
                onChange={(e) => setCanEdit(e.target.checked)}
                className="rounded border-border"
              />
              Cho phép chỉnh sửa
            </label>
            <Button
              onClick={shareWithSelected}
              disabled={!selected}
              loading={saving}
              className="w-full"
            >
              {saving ? "Đang share..." : "Share"}
            </Button>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">
              Đã share ({loading ? "..." : shares.length})
            </h3>
            {shares.length === 0 && !loading ? (
              <p className="text-sm text-muted">Chưa share với ai.</p>
            ) : (
              <ul className="space-y-2">
                {shares.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {s.sharedWith.name || s.sharedWith.email}
                      </p>
                      {s.sharedWith.name && (
                        <p className="truncate text-xs text-muted">
                          {s.sharedWith.email}
                        </p>
                      )}
                      <button
                        type="button"
                        className="mt-1"
                        onClick={() => toggleCanEdit(s)}
                      >
                        <Badge variant={s.canEdit ? "violet" : "default"}>
                          {s.canEdit ? "Có thể sửa" : "Chỉ xem / dùng"}
                        </Badge>
                      </button>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => revoke(s.id)}
                      loading={revokingId === s.id}
                    >
                      {revokingId !== s.id && <Trash2 className="h-3.5 w-3.5" />}
                      Thu hồi
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
