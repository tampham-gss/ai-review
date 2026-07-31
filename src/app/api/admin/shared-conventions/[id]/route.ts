import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  level: z.number().int().min(1).max(10).optional(),
  isEnabled: z.boolean().optional(),
  files: z
    .array(
      z.object({
        name: z.string().min(1),
        content: z.string().min(1),
      }),
    )
    .optional(),
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

  if (data.files) {
    await prisma.sharedConventionFile.deleteMany({ where: { categoryId: id } });
  }

  const category = await prisma.sharedConventionCategory.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.level !== undefined ? { level: data.level } : {}),
      ...(data.isEnabled !== undefined ? { isEnabled: data.isEnabled } : {}),
      ...(data.files
        ? {
            files: {
              create: data.files.map((f) => ({
                name: f.name,
                content: f.content,
              })),
            },
          }
        : {}),
    },
    include: { files: true },
  });

  await writeAuditLog({
    actorUserId: authResult.userId,
    action: "shared_convention.update",
    targetType: "sharedConventionCategory",
    targetId: id,
  });

  return NextResponse.json({ category });
}

export async function DELETE(_request: Request, { params }: Params) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;

  await prisma.sharedConventionCategory.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: authResult.userId,
    action: "shared_convention.delete",
    targetType: "sharedConventionCategory",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
