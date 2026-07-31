import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  canEdit: z.boolean(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;

  try {
    const body = patchSchema.parse(await request.json());
    const existing = await prisma.resourceShare.findFirst({
      where: { id, ownerUserId: authResult.userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    const share = await prisma.resourceShare.update({
      where: { id },
      data: { canEdit: body.canEdit },
      select: {
        id: true,
        canEdit: true,
        sharedWith: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ share });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Cập nhật thất bại";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const existing = await prisma.resourceShare.findFirst({
    where: {
      id,
      OR: [
        { ownerUserId: authResult.userId },
        { sharedWithUserId: authResult.userId },
      ],
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  await prisma.resourceShare.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
