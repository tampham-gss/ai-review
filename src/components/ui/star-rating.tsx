"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StarScore } from "@/lib/ai/model-rating";

interface StarRatingProps {
  stars: StarScore | number;
  max?: number;
  size?: "sm" | "md";
  showValue?: boolean;
  label?: string;
  className?: string;
}

export function StarRating({
  stars,
  max = 5,
  size = "sm",
  showValue = false,
  label,
  className,
}: StarRatingProps) {
  const value = Math.max(0, Math.min(max, Math.round(stars)));
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div
      className={cn("inline-flex items-center gap-1", className)}
      title={label ?? `${value}/${max} sao`}
    >
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < value;
        return (
          <Star
            key={i}
            className={cn(
              iconClass,
              filled
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-muted-soft",
            )}
          />
        );
      })}
      {showValue && (
        <span className="ml-1 text-xs tabular-nums text-muted">
          {value}/{max}
          {label ? ` · ${label}` : ""}
        </span>
      )}
    </div>
  );
}
