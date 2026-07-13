import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { consumeOtp, createAndSendOtp, verifyOtp } from "@/lib/otp";

const requestSchema = z.object({
  action: z.literal("request-otp"),
});

const changeSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("current"),
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  }),
  z.object({
    mode: z.literal("otp"),
    otp: z.string().min(4).max(8),
    newPassword: z.string().min(8),
  }),
]);

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  try {
    const json = await request.json();

    if (json?.action === "request-otp") {
      requestSchema.parse(json);
      const user = await prisma.user.findUnique({
        where: { id: authResult.userId },
      });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const result = await createAndSendOtp(user.email, "change");
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 429 });
      }

      return NextResponse.json({
        message: result.message,
        email: user.email,
        ...(result.devOtp ? { devOtp: result.devOtp } : {}),
      });
    }

    const body = changeSchema.parse(json);
    const user = await prisma.user.findUnique({
      where: { id: authResult.userId },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (body.mode === "current") {
      if (!user.passwordHash) {
        return NextResponse.json(
          {
            error:
              "Tài khoản chưa có mật khẩu (OAuth). Hãy dùng OTP gửi qua email.",
          },
          { status: 400 },
        );
      }
      const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
      if (!ok) {
        return NextResponse.json(
          { error: "Mật khẩu hiện tại không đúng" },
          { status: 400 },
        );
      }
    } else {
      const verified = await verifyOtp(user.email, body.otp, "change");
      if (!verified.ok) {
        return NextResponse.json({ error: verified.error }, { status: 400 });
      }
      await consumeOtp(verified.otpId);
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return NextResponse.json({ message: "Đã đổi mật khẩu thành công" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ (mật khẩu mới tối thiểu 8 ký tự)" },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Đổi mật khẩu thất bại";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
