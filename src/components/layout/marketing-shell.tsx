import Link from "next/link";
import { Sparkles } from "lucide-react";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" />
      </div>
      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-xl font-semibold">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500">
            <Sparkles className="h-5 w-5" />
          </div>
          AI Review Validator
        </Link>
        {children}
      </div>
    </div>
  );
}
