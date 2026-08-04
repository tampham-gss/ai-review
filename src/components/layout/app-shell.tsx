"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  FileCode2,
  GitBranch,
  History,
  LayoutDashboard,
  Menu,
  Settings,
  Shield,
  Sparkles,
  Webhook,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { AmbientBackground } from "@/components/layout/ambient-background";
import { UserMenu } from "@/components/layout/user-menu";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const baseNavItems: NavItem[] = [
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

function isNavActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  items,
  pathname,
  onNavigate,
  className,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav className={cn("space-y-1", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = isNavActive(pathname, item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
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
  );
}

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
  const [mobileOpen, setMobileOpen] = useState(false);

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

  // Đóng drawer khi đổi route / resize lên desktop
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 768) setMobileOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

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
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 md:hidden"
              aria-label={mobileOpen ? "Đóng menu" : "Mở menu"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Link
              href="/dashboard"
              className="flex min-w-0 items-center gap-2 font-semibold text-foreground"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className="truncate">AI Review Validator</span>
            </Link>
          </div>
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

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          aria-label="Đóng menu"
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            "absolute left-0 top-16 flex h-[calc(100vh-4rem)] w-[min(100%,18rem)] flex-col border-r border-border bg-background shadow-2xl transition-transform duration-200",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex-1 overflow-y-auto p-3">
            <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-soft">
              Điều hướng
            </p>
            <NavLinks
              items={navItems}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </aside>
      </div>

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
          <NavLinks
            items={navItems}
            pathname={pathname}
            className="max-h-[calc(100vh-7rem)] overflow-y-auto pr-1"
          />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
