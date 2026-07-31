"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bot,
  FileCode2,
  GitBranch,
  History,
  LayoutDashboard,
  Settings,
  Shield,
  Sparkles,
  Webhook,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { AmbientBackground } from "@/components/layout/ambient-background";
import { UserMenu } from "@/components/layout/user-menu";

const baseNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/stats", label: "Thống kê", icon: BarChart3, exact: true },
  { href: "/stats/quality", label: "Chất lượng", icon: BarChart3 },
  { href: "/connect", label: "GitLab", icon: GitBranch },
  { href: "/reviews", label: "Reviews", icon: FileCode2, exact: true },
  { href: "/reviews/history", label: "Lịch sử", icon: History },
  { href: "/settings/conventions", label: "Conventions", icon: Settings },
  { href: "/settings/ai", label: "AI Providers", icon: Bot },
  { href: "/settings/webhooks", label: "Webhook", icon: Webhook },
];

export function AppShell({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState(false);

  useEffect(() => {
    fetch("/api/system/status")
      .then((r) => r.json())
      .then((d) => {
        setAnnouncement(
          typeof d.announcement === "string" && d.announcement.trim()
            ? d.announcement
            : null,
        );
        setMaintenance(d.maintenanceMode === true);
      })
      .catch(() => undefined);
  }, []);

  const navItems = isAdmin
    ? [
        ...baseNavItems,
        { href: "/admin", label: "Admin", icon: Shield },
      ]
    : baseNavItems;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AmbientBackground variant="app" />

      <header className="sticky top-0 z-50 overflow-visible border-b border-border bg-header backdrop-blur-xl">
        <div className="relative z-50 mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="truncate">AI Review Validator</span>
          </Link>
          <div className="relative z-50 flex shrink-0 items-center gap-2">
            {isAdmin && (
              <Link href="/admin">
                <Button variant="outline" size="sm" className="hidden sm:inline-flex">
                  <Shield className="h-4 w-4" />
                  Admin
                </Button>
              </Link>
            )}
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      {(announcement || maintenance) && (
        <div
          className={cn(
            "border-b px-4 py-2 text-center text-sm",
            maintenance
              ? "border-amber-500/30 bg-amber-500/15 text-amber-950 dark:text-amber-100"
              : "border-violet-500/30 bg-violet-500/10 text-foreground",
          )}
        >
          {maintenance && (
            <span className="font-semibold">Đang bảo trì — </span>
          )}
          {announcement || "Một số chức năng tạm khóa với user thường."}
        </div>
      )}

      <div className="relative mx-auto flex max-w-7xl items-start gap-6 px-4 py-6">
        <aside className="sticky top-24 z-10 hidden w-56 shrink-0 md:block">
          <nav className="max-h-[calc(100vh-7rem)] space-y-1 overflow-y-auto pr-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const exact = "exact" in item && item.exact;
              const active = exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-violet-500/15 text-violet-700 dark:text-violet-200"
                      : "text-muted hover:bg-surface-hover hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
