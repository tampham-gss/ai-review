"use client";

import { cn } from "@/lib/utils";

type AmbientBackgroundProps = {
  variant?: "app" | "marketing";
  className?: string;
};

function Blob({
  tone,
  motion,
  className,
}: {
  tone: "violet" | "cyan";
  motion: "a" | "b" | "c";
  className?: string;
}) {
  return (
    <div className={cn("absolute", className)}>
      <div
        className={cn("ambient-blob", `ambient-blob--${motion}`, "h-full w-full rounded-full blur-3xl")}
        style={{
          background:
            tone === "violet" ? "var(--glow-violet)" : "var(--glow-cyan)",
        }}
      />
    </div>
  );
}

export function AmbientBackground({
  variant = "app",
  className,
}: AmbientBackgroundProps) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 overflow-hidden",
        className,
      )}
      aria-hidden
    >
      {variant === "marketing" ? (
        <>
          <Blob
            tone="violet"
            motion="a"
            className="left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2"
          />
          <Blob
            tone="cyan"
            motion="b"
            className="-left-24 bottom-16 h-72 w-72"
          />
          <Blob
            tone="violet"
            motion="c"
            className="-right-16 top-1/3 h-64 w-64"
          />
        </>
      ) : (
        <>
          <Blob
            tone="violet"
            motion="a"
            className="-left-32 top-0 h-96 w-96"
          />
          <Blob
            tone="cyan"
            motion="b"
            className="right-0 top-32 h-80 w-80"
          />
          <Blob
            tone="violet"
            motion="c"
            className="bottom-0 left-1/3 h-72 w-72"
          />
        </>
      )}
    </div>
  );
}
