import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["failed", "cancelled", "completed", "pending"]).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  let data;
  try {
    data = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const session = await prisma.reviewSession.update({
    where: { id },
    data: { ...(data.status ? { status: data.status } : {}) },
    select: { id: true, status: true },
  });

  if (data.status === "failed") {
    await writeAuditLog({
      actorUserId: authResult.userId,
      action: "session.mark_failed",
      targetType: "reviewSession",
      targetId: id,
    });
  }

  return NextResponse.json({ session });
}

export async function DELETE(_request: Request, { params }: Params) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  await prisma.reviewSession.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: authResult.userId,
    action: "session.delete",
    targetType: "reviewSession",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
