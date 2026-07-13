"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { ArrowLeft, History, RefreshCw } from "lucide-react";

interface ReviewSessionItem {
  id: string;
  projectPath: string;
  mrIid: number;
  mrTitle: string | null;
  sourceBranch: string;
  sourceType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null; email: string };
  validCount: number;
  invalidCount: number;
  partialCount: number;
  commentCount: number;
}

function statusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge variant="valid">Hoàn tất</Badge>;
    case "validating":
      return <Badge variant="violet">Đang chạy</Badge>;
    case "cancelled":
      return <Badge variant="invalid">Đã dừng</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function ReviewHistoryPage() {
  const [sessions, setSessions] = useState<ReviewSessionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/reviews?limit=50");
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Không tải được lịch sử");
        return;
      }
      setSessions(data.sessions ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("Lỗi kết nối khi tải lịch sử review");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Link href="/reviews">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
                Review mới
              </Button>
            </Link>
          </div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-white">
            <History className="h-7 w-7 shrink-0 text-violet-400" />
            <span className="min-w-0">Lịch sử review</span>
          </h1>
          <p className="mt-1 text-slate-400">
            {total} phiên đã chạy — chọn một phiên để xem chi tiết kết quả.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => load(true)}
          loading={refreshing}
        >
          <RefreshCw className="h-4 w-4" />
          Làm mới
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tất cả phiên</CardTitle>
          <CardDescription>Cuộn trong danh sách để xem thêm mà không kéo dài trang.</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có phiên review nào.</p>
          ) : (
            <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
              {sessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/reviews/${s.id}`}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:bg-white/[0.05] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-white">
                        {s.projectPath} !{s.mrIid}
                      </p>
                      {statusBadge(s.status)}
                    </div>
                    {s.mrTitle && (
                      <p className="truncate text-sm text-slate-300">{s.mrTitle}</p>
                    )}
                    <p className="truncate text-sm text-slate-400">
                      {s.sourceBranch} · {formatDate(s.createdAt)}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      Người chạy: {s.user.name || s.user.email}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Badge variant="valid">{s.validCount} valid</Badge>
                    <Badge variant="invalid">{s.invalidCount} invalid</Badge>
                    <Badge>{s.commentCount} comments</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
