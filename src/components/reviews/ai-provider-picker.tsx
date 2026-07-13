"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
import { getProviderMeta } from "@/lib/ai/provider-registry";
import type { StarScore } from "@/lib/ai/model-rating";
import { Bot, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReviewAiProvider {
  id: string;
  provider: string;
  model: string | null;
  isDefault: boolean;
  isEnabled: boolean;
  remaining: number | null;
  rating?: {
    overallStars: StarScore;
    label: string;
    reason: string;
  } | null;
}

interface AiProviderPickerProps {
  value: string | null;
  onChange: (id: string) => void;
  className?: string;
  autoSelectDefault?: boolean;
}

function getProviderLabel(provider: string) {
  return getProviderMeta(provider)?.label ?? provider;
}

export function pickDefaultProviderId(providers: ReviewAiProvider[]): string | null {
  const enabled = providers.filter((p) => p.isEnabled);
  if (enabled.length === 0) return null;
  return (
    enabled.find((p) => p.isDefault)?.id ??
    enabled[0]?.id ??
    null
  );
}

export function formatProviderChoice(p: ReviewAiProvider) {
  const label = getProviderLabel(p.provider);
  const model = p.model ?? "default";
  return `${label} · ${model}`;
}

export function AiProviderPicker({
  value,
  onChange,
  className,
  autoSelectDefault = true,
}: AiProviderPickerProps) {
  const [providers, setProviders] = useState<ReviewAiProvider[]>([]);
  const [bestProviderId, setBestProviderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/ai/providers");
        const data = await res.json();
        const list: ReviewAiProvider[] = (data.providers ?? []).filter(
          (p: ReviewAiProvider) => p.isEnabled,
        );
        // Sort: higher stars first for easier pick
        list.sort(
          (a, b) =>
            (b.rating?.overallStars ?? 0) - (a.rating?.overallStars ?? 0),
        );
        setProviders(list);
        setBestProviderId(data.bestProviderId ?? list[0]?.id ?? null);
        if (!initialized.current && list.length > 0) {
          initialized.current = true;
          if (autoSelectDefault && !value) {
            const defaultId = pickDefaultProviderId(list);
            if (defaultId) onChange(defaultId);
          }
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [autoSelectDefault, onChange, value]);

  const selected = providers.find((p) => p.id === value) ?? null;

  if (loading) {
    return (
      <div className={cn("rounded-xl border border-border bg-surface p-4", className)}>
        <p className="text-sm text-muted">Đang tải AI providers...</p>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className={cn("rounded-xl border border-amber-500/30 bg-amber-500/10 p-4", className)}>
        <p className="text-sm text-amber-900 dark:text-amber-200">
          Chưa có AI provider nào được bật.
        </p>
        <Link href="/settings/ai" className="mt-2 inline-block">
          <Button size="sm" variant="secondary">
            <Settings className="h-3.5 w-3.5" />
            Cấu hình AI Providers
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="h-4 w-4 text-violet-400" />
        <p className="text-sm font-medium text-muted">Model AI đang chọn</p>
        {selected && (
          <Badge variant="violet" className="font-mono text-xs">
            {formatProviderChoice(selected)}
          </Badge>
        )}
        {selected?.rating && (
          <StarRating
            stars={selected.rating.overallStars}
            showValue
            label={selected.rating.label}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {providers.map((p) => {
          const active = p.id === value;
          const isBest = p.id === bestProviderId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.id)}
              title={p.rating?.reason}
              className={cn(
                "min-w-[140px] max-w-full rounded-xl border px-3 py-2 text-left text-xs transition",
                active
                  ? "border-violet-500/50 bg-violet-500/15 text-violet-900 ring-1 ring-violet-500/40 dark:text-violet-100"
                  : "border-border bg-surface text-muted hover:border-border hover:bg-surface-hover",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{getProviderLabel(p.provider)}</p>
                {isBest && (
                  <span className="shrink-0 text-[10px] text-amber-700 dark:text-amber-300">
                    Best
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate font-mono text-[11px] opacity-80">
                {p.model ?? "default"}
              </p>
              {p.rating && (
                <div className="mt-1.5">
                  <StarRating stars={p.rating.overallStars} />
                </div>
              )}
              {p.isDefault && (
                <span className="mt-1 inline-block text-[10px] text-cyan-700 dark:text-cyan-400">
                  Mặc định
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-soft">
        Sao phản ánh độ mạnh model + hiệu suất thực tế. Nhấn để đổi model cho phiên review.
      </p>
    </div>
  );
}
