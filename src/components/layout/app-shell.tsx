"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BarChart3,
  Bot,
  FileCode2,
  GitBranch,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { AmbientBackground } from "@/components/layout/ambient-background";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/stats", label: "Thống kê", icon: BarChart3 },
  { href: "/connect", label: "GitLab", icon: GitBranch },
  { href: "/reviews", label: "Reviews", icon: FileCode2, exact: true },
  { href: "/reviews/history", label: "Lịch sử", icon: History },
  { href: "/settings/conventions", label: "Conventions", icon: Settings },
  { href: "/settings/ai", label: "AI Providers", icon: Bot },
  { href: "/settings/password", label: "Mật khẩu", icon: KeyRound },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AmbientBackground variant="app" />

      <header className="sticky top-0 z-40 border-b border-border bg-header backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="truncate">AI Review Validator</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto flex max-w-7xl items-start gap-6 px-4 py-6">
        <aside className="sticky top-24 z-20 hidden w-56 shrink-0 md:block">
          <nav className="max-h-[calc(100vh-7rem)] space-y-1 overflow-y-auto pr-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.exact
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
