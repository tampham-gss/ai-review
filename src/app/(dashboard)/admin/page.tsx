"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";

type Overview = {
  userCount: number;
  adminCount: number;
  disabledCount: number;
  sessionCount: number;
  validatingCount: number;
  failedCount: number;
  tokensMonth: number;
  tokensDay: number;
  connectionCount: number;
};

const modules = [
  {
    href: "/admin/users",
    title: "Users",
    desc: "Khóa/mở tài khoản, đổi role admin/user, gán quota token, xóa user",
  },
  {
    href: "/admin/usage",
    title: "Usage",
    desc: "Token toàn hệ thống theo user, action, timeline",
  },
  {
    href: "/admin/sessions",
    title: "Sessions",
    desc: "Mọi phiên review — lọc status, mark failed, xóa session treo",
  },
  {
    href: "/admin/connections",
    title: "GitLab",
    desc: "Ai đang nối host nào (không hiện PAT)",
  },
  {
    href: "/admin/shared",
    title: "Shared",
    desc: "Convention & AI provider dùng chung cho mọi user",
  },
  {
    href: "/admin/settings",
    title: "Cấu hình",
    desc: "Tắt đăng ký, bảo trì, banner, quota mặc định, retention",
  },
  {
    href: "/admin/audit",
    title: "Audit",
    desc: "Nhật ký thao tác admin",
  },
  {
    href: "/admin/health",
    title: "Health",
    desc: "Trạng thái DB / env / sessions đang chạy",
  },
];

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/overview")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setData(d.overview ?? null);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Không tải được overview"),
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;
  if (error) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        {error === "Forbidden"
          ? "Session chưa nhận role admin. Hãy đăng xuất rồi đăng nhập lại bằng tài khoản admin / 123."
          : error}
      </p>
    );
  }
  if (!data) return <p className="text-red-400">Không tải được overview.</p>;

  const cards = [
    {
      label: "Users",
      value: data.userCount,
      hint: `${data.adminCount} admin · ${data.disabledCount} khóa`,
    },
    {
      label: "Sessions",
      value: data.sessionCount,
      hint: `${data.validatingCount} đang chạy · ${data.failedCount} lỗi/hủy`,
    },
    {
      label: "Token tháng này",
      value: data.tokensMonth.toLocaleString(),
      hint: `${data.tokensDay.toLocaleString()} / 24h`,
    },
    {
      label: "GitLab connections",
      value: data.connectionCount,
      hint: "Không hiện PAT",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-sm">
        <p className="font-semibold text-foreground">
          Đây là khu vực quản trị hệ thống — khác với Dashboard user.
        </p>
        <p className="mt-1 text-muted">
          Sidebar vẫn có Review/GitLab để admin cũng dùng app như user. Phần quản lý nằm
          trong các mục bên dưới (hoặc nút Admin trên header).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted">
                {c.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums text-foreground">
                {c.value}
              </p>
              <p className="mt-1 text-xs text-muted-soft">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {modules.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-violet-500/40 hover:bg-surface-hover"
          >
            <p className="font-semibold text-foreground">{m.title}</p>
            <p className="mt-1 text-sm text-muted">{m.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
