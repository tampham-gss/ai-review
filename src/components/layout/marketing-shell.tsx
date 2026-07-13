"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Toaster } from "@/components/ui/toaster";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "var(--glow-violet)" }}
        />
      </div>
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
        <Link
          href="/"
          className="mb-8 flex items-center justify-center gap-2 text-xl font-semibold text-foreground"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          AI Review Validator
        </Link>
        {children}
      </div>
      <Toaster />
    </div>
  );
}
