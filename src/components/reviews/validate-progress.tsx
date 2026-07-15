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
        percent: event.percent > 0 ? event.percent : prev.percent,
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
    case "retry":
      return {
        ...prev,
        status: "running",
        percent: event.percent,
        phaseMessage: event.message,
        total: event.total,
        current: event.current,
      };
    case "heartbeat":
      return {
        ...prev,
        status: "running",
        percent: event.percent > 0 ? event.percent : prev.percent,
        phaseMessage: event.message,
        ...(event.current !== undefined ? { current: event.current } : {}),
        ...(event.total !== undefined ? { total: event.total } : {}),
      };
    case "need_continue":
      return {
        ...prev,
        status: "running",
        percent: event.percent,
        phaseMessage: event.message,
        total: event.total,
        current: event.current,
        sessionId: event.sessionId,
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
        ...(event.current !== undefined ? { current: event.current } : {}),
        ...(event.total !== undefined ? { total: event.total } : {}),
        currentComment: null,
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
              <span className="shrink-0 text-muted">Tiến độ</span>
              <span className="font-mono font-medium text-violet-300">{state.percent}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-surface-hover">
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

          <p className="break-words text-sm text-muted">{state.phaseMessage}</p>

          {state.total > 0 && (
            <p className="text-xs text-muted-soft">
              Comment: {state.current}/{state.total}
            </p>
          )}

          {state.status === "running" &&
            /thử lại|timeout|rate limit|kết nối lại/i.test(state.phaseMessage) && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                AI đang gặp vấn đề tạm thời — hệ thống tự thử lại, vui lòng chờ.
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
                  <span className="flex min-w-0 items-center gap-1 font-mono text-xs text-cyan-700 dark:text-cyan-300">
                    <FileCode2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {state.currentComment.filePath}
                      {state.currentComment.line ? `:${state.currentComment.line}` : ""}
                    </span>
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted">{state.currentComment.author}</p>
              <p className="mt-2 line-clamp-3 break-words text-sm text-foreground">
                {state.currentComment.preview}
              </p>
            </div>
          )}

          {state.doneItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-soft">
                Đã xử lý
              </p>
              <div className="max-h-36 space-y-1.5 overflow-y-auto">
                {state.doneItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded-lg bg-surface px-3 py-2 text-xs text-muted"
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
  let sessionId: string | null =
    typeof payload.sessionId === "string" ? payload.sessionId : null;
  let continueCount = 0;
  const maxContinues = 80;

  while (true) {
    if (signal?.aborted) throw new ValidateAbortedError();

    const body =
      sessionId && continueCount > 0
        ? { sessionId, stream: true }
        : { ...payload, stream: true };

    const outcome = await streamValidateOnce(body, onEvent, signal);

    if (outcome.kind === "complete") {
      return outcome.sessionId;
    }

    if (outcome.kind === "need_continue") {
      sessionId = outcome.sessionId;
      continueCount += 1;
      if (continueCount > maxContinues) {
        throw new Error(
          "Validate bị tạm dừng quá nhiều lần (giới hạn server). Hãy mở lại phiên trong Lịch sử hoặc chạy lại.",
        );
      }
      onEvent({
        type: "phase",
        phase: "client_continue",
        percent: outcome.percent,
        message: `Đang mở batch tiếp theo trên Vercel (${continueCount}) — ${outcome.remaining} comment còn lại...`,
      });
      // Nhỏ delay tránh rate-limit / cold start storm
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }

    throw new Error("Stream validate kết thúc bất thường (không có complete).");
  }
}

async function streamValidateOnce(
  payload: Record<string, unknown>,
  onEvent: (event: ValidateProgressEvent) => void,
  signal?: AbortSignal,
): Promise<
  | { kind: "complete"; sessionId: string | null }
  | {
      kind: "need_continue";
      sessionId: string;
      remaining: number;
      percent: number;
    }
> {
  const res = await fetch("/api/reviews/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const raw =
      typeof data.error === "string" ? data.error : "Validate thất bại";
    const looksTimeout =
      res.status === 504 ||
      res.status === 502 ||
      /timeout|cancel|FUNCTION_INVOCATION/i.test(raw);
    throw new Error(
      looksTimeout
        ? `${raw} — có thể do giới hạn thời gian Vercel. Hệ thống sẽ thử chia batch; hãy chạy lại nếu vẫn lỗi.`
        : raw,
    );
  }

  if (!res.body) {
    throw new Error("Không nhận được stream progress");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sessionId: string | null = null;
  let sawTerminal = false;
  let needContinue: {
    sessionId: string;
    remaining: number;
    percent: number;
  } | null = null;
  let lastEventAt = Date.now();

  const stallWatch = window.setInterval(() => {
    if (signal?.aborted) return;
    if (Date.now() - lastEventAt > 45_000) {
      onEvent({
        type: "heartbeat",
        percent: 0,
        message:
          "Lâu không nhận được phản hồi từ server — có thể Vercel đang chậm hoặc sắp timeout. Đang chờ...",
      });
      lastEventAt = Date.now();
    }
  }, 15_000);

  const abortPromise = new Promise<never>((_, reject) => {
    if (signal?.aborted) {
      reject(new ValidateAbortedError());
      return;
    }
    const onAbort = () => {
      void reader.cancel().catch(() => undefined);
      reject(new ValidateAbortedError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        throw new ValidateAbortedError();
      }

      const { done, value } = await Promise.race([
        reader.read(),
        abortPromise,
      ]);
      if (done) break;

      lastEventAt = Date.now();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as ValidateProgressEvent;
        onEvent(event);
        if (event.type === "complete") {
          sessionId = event.sessionId;
          sawTerminal = true;
        }
        if (event.type === "need_continue") {
          needContinue = {
            sessionId: event.sessionId,
            remaining: event.remaining,
            percent: event.percent,
          };
          sawTerminal = true;
        }
        if (event.type === "cancelled") {
          sessionId = event.sessionId;
          throw new ValidateAbortedError(event.message);
        }
        if (event.type === "error") throw new Error(event.message);
      }
    }
  } catch (error) {
    if (
      signal?.aborted ||
      error instanceof ValidateAbortedError ||
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw error instanceof ValidateAbortedError
        ? error
        : new ValidateAbortedError();
    }
    throw error;
  } finally {
    window.clearInterval(stallWatch);
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  if (needContinue) {
    return { kind: "need_continue", ...needContinue };
  }

  if (!sawTerminal) {
    throw new Error(
      sessionId
        ? `Kết nối bị ngắt giữa chừng (thường gặp trên Vercel). Phiên ${sessionId} có thể tiếp tục — thử chạy lại hoặc mở Lịch sử.`
        : "Kết nối bị ngắt giữa chừng và không có phản hồi từ server (timeout Vercel / proxy).",
    );
  }

  return { kind: "complete", sessionId };
}
