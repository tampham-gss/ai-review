"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ValidateProgressEvent } from "@/lib/reviews/validate-runner";
import { Bot, CheckCircle2, FileCode2, Loader2, Square } from "lucide-react";

export interface ValidateProgressState {
  percent: number;
  phaseMessage: string;
  total: number;
  current: number;
  currentComment: Extract<ValidateProgressEvent, { type: "validating" }>["comment"] | null;
  doneItems: Array<{ message: string; verdict?: string }>;
  status: "idle" | "running" | "complete" | "error" | "cancelled";
  error?: string;
  sessionId?: string | null;
}

export const initialProgressState: ValidateProgressState = {
  percent: 0,
  phaseMessage: "",
  total: 0,
  current: 0,
  currentComment: null,
  doneItems: [],
  status: "idle",
};

export function applyProgressEvent(
  prev: ValidateProgressState,
  event: ValidateProgressEvent,
): ValidateProgressState {
  switch (event.type) {
    case "phase":
    case "comments_loaded":
      return {
        ...prev,
        status: "running",
        percent: event.percent,
        phaseMessage: event.message,
        total: event.type === "comments_loaded" ? event.total : prev.total,
      };
    case "validating":
      return {
        ...prev,
        status: "running",
        percent: event.percent,
        phaseMessage: event.message,
        total: event.total,
        current: event.current,
        currentComment: event.comment,
      };
    case "comment_done":
      return {
        ...prev,
        percent: event.percent,
        phaseMessage: event.message,
        current: event.current,
        doneItems: [
          { message: event.message, verdict: event.verdict },
          ...prev.doneItems,
        ].slice(0, 8),
      };
    case "complete":
      return {
        ...prev,
        status: "complete",
        percent: 100,
        phaseMessage: event.message,
        total: event.total,
        sessionId: event.sessionId,
      };
    case "cancelled":
      return {
        ...prev,
        status: "cancelled",
        phaseMessage: event.message,
        sessionId: event.sessionId,
        currentComment: null,
      };
    case "error":
      return {
        ...prev,
        status: "error",
        error: event.message,
        phaseMessage: event.message,
      };
    default:
      return prev;
  }
}

interface ValidateProgressPanelProps {
  state: ValidateProgressState;
  visible: boolean;
  onClose?: () => void;
  onStop?: () => void;
  stopping?: boolean;
}

export function ValidateProgressPanel({
  state,
  visible,
  onClose,
  onStop,
  stopping = false,
}: ValidateProgressPanelProps) {
  if (!visible) return null;

  const canClose =
    state.status === "error" ||
    state.status === "cancelled" ||
    state.status === "complete";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-xl border-violet-500/30 shadow-2xl shadow-violet-500/10">
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2 text-lg">
            {state.status === "complete" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
            ) : state.status === "error" || state.status === "cancelled" ? (
              <Bot className="h-5 w-5 shrink-0 text-red-400" />
            ) : (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-violet-400" />
            )}
            <span className="min-w-0 truncate">
              {state.status === "complete"
                ? "Validate hoàn tất"
                : state.status === "cancelled"
                  ? "Đã dừng validate"
                  : state.status === "error"
                    ? "Validate thất bại"
                    : "AI đang validate review..."}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2 text-sm">
              <span className="shrink-0 text-slate-400">Tiến độ</span>
              <span className="font-mono font-medium text-violet-300">{state.percent}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500 ease-out",
                  state.status === "complete"
                    ? "bg-emerald-500"
                    : state.status === "error" || state.status === "cancelled"
                      ? "bg-red-500"
                      : "bg-gradient-to-r from-violet-600 to-cyan-500",
                )}
                style={{ width: `${state.percent}%` }}
              />
            </div>
          </div>

          <p className="break-words text-sm text-slate-300">{state.phaseMessage}</p>

          {state.total > 0 && (
            <p className="text-xs text-slate-500">
              Comment: {state.current}/{state.total}
            </p>
          )}

          {state.currentComment && state.status === "running" && (
            <div className="animate-pulse rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
              <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant="violet">
                  <Bot className="mr-1 h-3 w-3" />
                  Đang check
                </Badge>
                {state.currentComment.severity && (
                  <Badge variant="high">{state.currentComment.severity}</Badge>
                )}
                {state.currentComment.filePath && (
                  <span className="flex min-w-0 items-center gap-1 font-mono text-xs text-cyan-300">
                    <FileCode2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {state.currentComment.filePath}
                      {state.currentComment.line ? `:${state.currentComment.line}` : ""}
                    </span>
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-slate-400">{state.currentComment.author}</p>
              <p className="mt-2 line-clamp-3 break-words text-sm text-slate-200">
                {state.currentComment.preview}
              </p>
            </div>
          )}

          {state.doneItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Đã xử lý
              </p>
              <div className="max-h-36 space-y-1.5 overflow-y-auto">
                {state.doneItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-slate-400"
                  >
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span className="min-w-0 break-words line-clamp-2">{item.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {state.error && (
            <p className="break-words rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {state.error}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            {state.status === "running" && onStop && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={onStop}
                loading={stopping}
              >
                {!stopping && <Square className="h-3.5 w-3.5 fill-current" />}
                {stopping ? "Đang dừng..." : "Ngắt validate"}
              </Button>
            )}
            {canClose && onClose && (
              <Button variant="secondary" className="w-full" onClick={onClose}>
                Đóng
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export class ValidateAbortedError extends Error {
  constructor(message = "Đã dừng validate") {
    super(message);
    this.name = "ValidateAbortedError";
  }
}

export async function streamValidate(
  payload: Record<string, unknown>,
  onEvent: (event: ValidateProgressEvent) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch("/api/reviews/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, stream: true }),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data.error === "string" ? data.error : "Validate thất bại",
    );
  }

  if (!res.body) {
    throw new Error("Không nhận được stream progress");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sessionId: string | null = null;

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        throw new ValidateAbortedError();
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as ValidateProgressEvent;
        onEvent(event);
        if (event.type === "complete") sessionId = event.sessionId;
        if (event.type === "cancelled") {
          sessionId = event.sessionId;
          throw new ValidateAbortedError(event.message);
        }
        if (event.type === "error") throw new Error(event.message);
      }
    }
  } catch (error) {
    if (signal?.aborted || error instanceof ValidateAbortedError) {
      throw error instanceof ValidateAbortedError
        ? error
        : new ValidateAbortedError();
    }
    throw error;
  }

  return sessionId;
}
