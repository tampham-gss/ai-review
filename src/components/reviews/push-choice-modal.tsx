"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { MessageSquare, X } from "lucide-react";

export type PushScopeChoice = "unpushed_only" | "include_pushed";

type PushChoiceModalProps = {
  open: boolean;
  title: string;
  description: string;
  unpushedCount: number;
  pushedCount: number;
  totalCount: number;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (choice: PushScopeChoice) => void;
};

export function PushChoiceModal({
  open,
  title,
  description,
  unpushedCount,
  pushedCount,
  totalCount,
  loading = false,
  onClose,
  onConfirm,
}: PushChoiceModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <MessageSquare className="h-5 w-5 shrink-0 text-violet-400" />
              <span className="min-w-0">{title}</span>
            </h2>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={onClose}
            disabled={loading}
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mb-4 space-y-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">
          <p>
            Tổng: <span className="font-medium text-foreground">{totalCount}</span>
          </p>
          <p>
            Đã push: <span className="font-medium text-foreground">{pushedCount}</span>
          </p>
          <p>
            Chưa push:{" "}
            <span className="font-medium text-foreground">{unpushedCount}</span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="default"
            className="w-full justify-start"
            loading={loading}
            onClick={() => onConfirm("unpushed_only")}
          >
            Chỉ push những cái chưa đẩy ({unpushedCount})
          </Button>
          <Button
            variant="secondary"
            className="w-full justify-start"
            loading={loading}
            onClick={() => onConfirm("include_pushed")}
          >
            Push lại tất cả ({totalCount}) — gồm cả đã push
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
