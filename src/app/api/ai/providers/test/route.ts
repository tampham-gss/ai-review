import { requireUser } from "@/lib/api-helpers";
import { testAiConnection } from "@/lib/ai/providers";
import { aiProviderTestSchema } from "@/lib/ai/schemas";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  try {
    const body = aiProviderTestSchema.parse(await request.json());
    const result = await testAiConnection(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Kiểm tra kết nối thất bại";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
