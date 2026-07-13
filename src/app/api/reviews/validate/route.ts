import { requireUser } from "@/lib/api-helpers";
import {
  runValidateJob,
  validateBodySchema,
  type ValidateProgressEvent,
} from "@/lib/reviews/validate-runner";
import { NextResponse } from "next/server";
import { z } from "zod";

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
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: ValidateProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Client đã abort / stream đã đóng
        }
      };

      try {
        await runValidateJob(authResult.userId, body, send, request.signal);
      } catch (error) {
        if (!request.signal.aborted) {
          send({
            type: "error",
            message: error instanceof Error ? error.message : "Validate thất bại",
          });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      // AbortSignal từ request đã được truyền vào job
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
