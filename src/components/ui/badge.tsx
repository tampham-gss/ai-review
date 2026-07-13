import { cn } from "@/lib/utils";

const variants = {
  default: "bg-white/10 text-slate-200",
  high: "bg-red-500/20 text-red-300 border border-red-500/30",
  valid: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  invalid: "bg-orange-500/20 text-orange-300 border border-orange-500/30",
  partial: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  violet: "bg-violet-500/20 text-violet-300 border border-violet-500/30",
};

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
