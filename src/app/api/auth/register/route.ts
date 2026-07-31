import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).optional(),
});

export async function POST(request: Request) {
  try {
    const { getSystemSettings } = await import("@/lib/admin");
    const settings = await getSystemSettings();
    if (!settings.registrationOpen) {
      return NextResponse.json(
        { error: "Đăng ký đang bị tắt bởi admin" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const data = schema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (existing) {
      return NextResponse.json({ error: "Email đã tồn tại" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        name: data.name ?? data.email.split("@")[0],
        role: "user",
      },
    });

    return NextResponse.json({ id: user.id, email: user.email });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Đăng ký thất bại" }, { status: 500 });
  }
}
