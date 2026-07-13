import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { consumeOtp, verifyOtp } from "@/lib/otp";

const schema = z.object({
  email: z.string().email(),
  otp: z.string().min(4).max(8),
  newPassword: z.string().min(8),
  purpose: z.enum(["reset", "change"]).default("reset"),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const email = body.email.toLowerCase().trim();

    const verified = await verifyOtp(email, body.otp, body.purpose);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: "Không tìm thấy tài khoản" },
        { status: 404 },
      );
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await consumeOtp(verified.otpId);

    return NextResponse.json({
      message: "Đã cập nhật mật khẩu thành công. Bạn có thể đăng nhập.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ (mật khẩu tối thiểu 8 ký tự)" },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Đặt lại mật khẩu thất bại";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
