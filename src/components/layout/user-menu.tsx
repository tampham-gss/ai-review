"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, KeyRound, LogOut, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

function getInitials(name?: string | null, email?: string | null) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const name = session?.user?.name?.trim() || null;
  const email = session?.user?.email ?? null;
  const displayName = name || email || "Tài khoản";
  const initials = getInitials(name, email);

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function openMenu() {
    clearCloseTimer();
    setOpen(true);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      clearCloseTimer();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative z-50"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex max-w-[220px] items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors",
          "hover:bg-surface-hover",
          open && "bg-surface-hover",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-xs font-semibold text-white">
          {initials}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-medium text-foreground">
            {displayName}
          </span>
          {name && email && (
            <span className="block truncate text-[11px] text-muted">{email}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "hidden h-4 w-4 shrink-0 text-muted transition-transform sm:block",
            open && "rotate-180",
          )}
        />
      </button>

      <div
        role="menu"
        className={cn(
          "absolute right-0 top-full z-[100] mt-1 w-56 origin-top-right rounded-xl border border-border",
          "bg-background p-1.5 shadow-2xl ring-1 ring-black/10 transition dark:bg-zinc-900 dark:ring-white/10",
          open
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0",
        )}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
      >
        <div className="border-b border-border px-3 py-2 sm:hidden">
          <p className="truncate text-sm font-medium">{displayName}</p>
          {email && <p className="truncate text-xs text-muted">{email}</p>}
        </div>

        <Link
          href="/settings/profile"
          role="menuitem"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-hover"
        >
          <UserRound className="h-4 w-4 text-muted" />
          Cập nhật thông tin
        </Link>
        <Link
          href="/settings/password"
          role="menuitem"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-hover"
        >
          <KeyRound className="h-4 w-4 text-muted" />
          Đổi mật khẩu
        </Link>
        <div className="my-1 border-t border-border" />
        <button
          type="button"
          role="menuitem"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </button>
      </div>
    </div>
  );
}
