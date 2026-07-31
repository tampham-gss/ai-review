import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  level: z.number().int().min(1).max(10).default(1),
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

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const categories = await prisma.sharedConventionCategory.findMany({
    include: { files: true },
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ categories });
}

export async function POST(request: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  let data;
  try {
    data = createSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const category = await prisma.sharedConventionCategory.create({
    data: {
      name: data.name,
      level: data.level,
      isEnabled: data.isEnabled ?? true,
      files: data.files
        ? { create: data.files.map((f) => ({ name: f.name, content: f.content })) }
        : undefined,
    },
    include: { files: true },
  });

  await writeAuditLog({
    actorUserId: authResult.userId,
    action: "shared_convention.create",
    targetType: "sharedConventionCategory",
    targetId: category.id,
  });

  return NextResponse.json({ category });
}
