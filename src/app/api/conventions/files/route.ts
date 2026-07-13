import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const fileSchema = z.object({
  categoryId: z.string(),
  name: z.string().min(1),
  content: z.string().min(1),
});

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const body = fileSchema.parse(await request.json());

  const category = await prisma.conventionCategory.findFirst({
    where: { id: body.categoryId, userId: authResult.userId },
  });
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const file = await prisma.conventionFile.create({
    data: {
      categoryId: body.categoryId,
      name: body.name.endsWith(".md") ? body.name : `${body.name}.md`,
      content: body.content,
    },
  });

  return NextResponse.json({ file });
}

export async function DELETE(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("id");
  if (!fileId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const file = await prisma.conventionFile.findFirst({
    where: { id: fileId, category: { userId: authResult.userId } },
  });
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  await prisma.conventionFile.delete({ where: { id: fileId } });
  return NextResponse.json({ ok: true });
}
