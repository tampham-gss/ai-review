import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const user = await prisma.user.findUnique({
    where: { id: authResult.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().optional(),
});

export async function PATCH(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  try {
    const body = patchSchema.parse(await request.json());
    if (body.name === undefined && body.email === undefined) {
      return NextResponse.json(
        { error: "Cần name hoặc email để cập nhật" },
        { status: 400 },
      );
    }

    if (body.email) {
      const taken = await prisma.user.findFirst({
        where: {
          email: body.email.toLowerCase(),
          id: { not: authResult.userId },
        },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json(
          { error: "Email đã được sử dụng" },
          { status: 400 },
        );
      }
    }

    const user = await prisma.user.update({
      where: { id: authResult.userId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.email !== undefined
          ? { email: body.email.toLowerCase() }
          : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Cập nhật thất bại";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
