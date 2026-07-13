import { NextResponse } from "next/server";
import { z } from "zod";
import { createAndSendOtp } from "@/lib/otp";

const schema = z.object({
  email: z.string().email(),
  purpose: z.enum(["reset", "change"]).default("reset"),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const result = await createAndSendOtp(body.email, body.purpose);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 429 });
    }

    return NextResponse.json({
      message: result.message,
      ...(result.devOtp ? { devOtp: result.devOtp } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Email không hợp lệ" }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Gửi OTP thất bại";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
