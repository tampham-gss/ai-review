import { cn } from "@/lib/utils";

const variants = {
  default:
    "border border-border bg-surface text-foreground",
  high:
    "border border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300",
  valid:
    "border border-emerald-500/30 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  invalid:
    "border border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-300",
  partial:
    "border border-yellow-500/30 bg-yellow-500/15 text-yellow-800 dark:text-yellow-300",
  violet:
    "border border-violet-500/30 bg-violet-500/15 text-violet-800 dark:text-violet-300",
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
