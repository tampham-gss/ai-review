import { requireUser } from "@/lib/api-helpers";
import {
  runValidateJob,
  validateBodySchema,
  type ValidateProgressEvent,
} from "@/lib/reviews/validate-runner";
import { NextResponse } from "next/server";
import { z } from "zod";

/** Vercel Pro: tới 300s. Hobby bị cap ~60s — client sẽ auto continue theo batch. */
export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const json = await request.json();
  const stream = json?.stream === true;

  if (!stream) {
    try {
      const body = validateBodySchema.parse(json);
      let sessionId = "";
      await runValidateJob(authResult.userId, body, (event) => {
        if (event.type === "complete") sessionId = event.sessionId;
        if (event.type === "need_continue") sessionId = event.sessionId;
      });
      return NextResponse.json({ sessionId, total: 0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Validate thất bại";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  let body;
  try {
    body = validateBodySchema.parse(json);
  } catch (error) {
    const message =
      error instanceof z.ZodError ? "Dữ liệu không hợp lệ" : "Validate thất bại";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const jobAbort = new AbortController();
  const onRequestAbort = () => jobAbort.abort();
  if (request.signal.aborted) jobAbort.abort();
  else request.signal.addEventListener("abort", onRequestAbort, { once: true });

  const readable = new ReadableStream({
    async start(controller) {
      let lastPercent = 0;
      let lastCurrent = 0;
      let lastTotal = 0;

      const send = (event: ValidateProgressEvent) => {
        try {
          if ("percent" in event && typeof event.percent === "number") {
            lastPercent = event.percent;
          }
          if ("current" in event && typeof event.current === "number") {
            lastCurrent = event.current;
          }
          if ("total" in event && typeof event.total === "number") {
            lastTotal = event.total;
          }
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          jobAbort.abort();
        }
      };

      // Giữ kết nối sống trên Vercel/proxy — tránh stream im lặng bị cắt
      const heartbeat = setInterval(() => {
        if (jobAbort.signal.aborted) return;
        send({
          type: "heartbeat",
          percent: lastPercent,
          current: lastCurrent || undefined,
          total: lastTotal || undefined,
          message:
            lastCurrent && lastTotal
              ? `Server vẫn đang xử lý comment ${lastCurrent}/${lastTotal}...`
              : "Server vẫn đang xử lý — vui lòng chờ...",
        });
      }, 8_000);

      try {
        await runValidateJob(authResult.userId, body, send, jobAbort.signal);
      } catch (error) {
        if (!jobAbort.signal.aborted) {
          send({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Validate thất bại (có thể do timeout Vercel — hãy thử lại).",
          });
        } else {
          send({
            type: "cancelled",
            sessionId: null,
            message: "Đã dừng validate theo yêu cầu.",
            percent: 0,
          });
        }
      } finally {
        clearInterval(heartbeat);
        request.signal.removeEventListener("abort", onRequestAbort);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      jobAbort.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
