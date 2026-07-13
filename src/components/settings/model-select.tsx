"use client";

import { Input } from "@/components/ui/input";
import {
  CUSTOM_MODEL_VALUE,
  getProviderModels,
  isKnownModel,
  type AiModelOption,
} from "@/lib/ai/provider-models";
import type { AiProviderName } from "@/lib/ai/provider-registry";

const selectClassName =
  "h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white";

interface ModelSelectProps {
  provider: AiProviderName;
  value: string;
  onChange: (model: string) => void;
}

export function ModelSelect({ provider, value, onChange }: ModelSelectProps) {
  const models = getProviderModels(provider);
  const useCustom = value !== "" && !isKnownModel(provider, value);
  const selectValue = useCustom ? CUSTOM_MODEL_VALUE : value || models[0]?.value || "";

  function handleSelectChange(next: string) {
    if (next === CUSTOM_MODEL_VALUE) {
      onChange(useCustom ? value : "");
      return;
    }
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <select
        className={selectClassName}
        value={selectValue}
        onChange={(e) => handleSelectChange(e.target.value)}
      >
        {models.map((m) => (
          <option key={m.value} value={m.value}>
            {formatOptionLabel(m)}
          </option>
        ))}
        <option value={CUSTOM_MODEL_VALUE}>Khác (nhập tay)...</option>
      </select>

      {(selectValue === CUSTOM_MODEL_VALUE || useCustom) && (
        <Input
          placeholder="Nhập tên model (vd: gemini-2.0-flash-lite)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function formatOptionLabel(m: AiModelOption): string {
  return m.badge ? `${m.label} — ${m.badge}` : m.label;
}
