import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  isDisabled: z.boolean().optional(),
  monthlyTokenQuota: z.number().int().positive().nullable().optional(),
  name: z.string().min(1).max(120).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  if (id === authResult.userId) {
    const body = await request.json().catch(() => ({}));
    if (body.isDisabled === true || body.role === "user") {
      return NextResponse.json(
        { error: "Không thể tự khóa hoặc hạ quyền chính mình" },
        { status: 400 },
      );
    }
  }

  let data;
  try {
    data = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "User không tồn tại" }, { status: 404 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.isDisabled !== undefined ? { isDisabled: data.isDisabled } : {}),
      ...(data.monthlyTokenQuota !== undefined
        ? { monthlyTokenQuota: data.monthlyTokenQuota }
        : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isDisabled: true,
      monthlyTokenQuota: true,
    },
  });

  if (data.isDisabled === true) {
    await writeAuditLog({
      actorUserId: authResult.userId,
      action: "user.disable",
      targetType: "user",
      targetId: id,
    });
  } else if (data.isDisabled === false) {
    await writeAuditLog({
      actorUserId: authResult.userId,
      action: "user.enable",
      targetType: "user",
      targetId: id,
    });
  }
  if (data.role) {
    await writeAuditLog({
      actorUserId: authResult.userId,
      action: "user.role_change",
      targetType: "user",
      targetId: id,
      meta: { role: data.role },
    });
  }
  if (data.monthlyTokenQuota !== undefined) {
    await writeAuditLog({
      actorUserId: authResult.userId,
      action: "user.quota_change",
      targetType: "user",
      targetId: id,
      meta: { monthlyTokenQuota: data.monthlyTokenQuota },
    });
  }

  return NextResponse.json({ user });
}

export async function DELETE(_request: Request, { params }: Params) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  if (id === authResult.userId) {
    return NextResponse.json(
      { error: "Không thể xóa chính tài khoản đang đăng nhập" },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "User không tồn tại" }, { status: 404 });
  }
  if (existing.email === "admin") {
    return NextResponse.json(
      { error: "Không thể xóa tài khoản admin gốc" },
      { status: 400 },
    );
  }

  await prisma.user.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: authResult.userId,
    action: "user.delete",
    targetType: "user",
    targetId: id,
    meta: { email: existing.email },
  });

  return NextResponse.json({ ok: true });
}
