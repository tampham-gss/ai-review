"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

type Listener = (items: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener(toasts));
}

export function toast(message: string, type: ToastType = "info") {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  toasts = [...toasts, { id, message, type }];
  emit();

  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 3500);
}

toast.success = (message: string) => toast(message, "success");
toast.error = (message: string) => toast(message, "error");
toast.info = (message: string) => toast(message, "info");

function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const styles = {
  success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-100",
  error: "border-red-500/30 bg-red-500/15 text-red-100",
  info: "border-cyan-500/30 bg-cyan-500/15 text-cyan-100",
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.add(setItems);
    setItems(toasts);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0">
      {items.map((item) => {
        const Icon = icons[item.type];
        return (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur-md",
              styles[item.type],
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1 break-words">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="shrink-0 rounded-lg p-0.5 opacity-70 hover:opacity-100"
              aria-label="Đóng"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
