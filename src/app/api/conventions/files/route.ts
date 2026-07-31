import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { assertResourceAccess } from "@/lib/shares";
import { NextResponse } from "next/server";
import { z } from "zod";

const fileSchema = z.object({
  categoryId: z.string(),
  name: z.string().min(1),
  content: z.string().min(1),
});

const updateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const body = fileSchema.parse(await request.json());

  const access = await assertResourceAccess(
    authResult.userId,
    "convention_category",
    body.categoryId,
    { needEdit: true },
  );
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 403 ? "Không có quyền chỉnh sửa" : "Category not found" },
      { status: access.status },
    );
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

export async function PATCH(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  try {
    const body = updateSchema.parse(await request.json());
    if (body.name === undefined && body.content === undefined) {
      return NextResponse.json(
        { error: "Cần name hoặc content để cập nhật" },
        { status: 400 },
      );
    }

    const existing = await prisma.conventionFile.findFirst({
      where: { id: body.id },
      select: { id: true, categoryId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const access = await assertResourceAccess(
      authResult.userId,
      "convention_category",
      existing.categoryId,
      { needEdit: true },
    );
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 403 ? "Không có quyền chỉnh sửa" : "File not found" },
        { status: access.status },
      );
    }

    const file = await prisma.conventionFile.update({
      where: { id: body.id },
      data: {
        ...(body.name !== undefined
          ? {
              name: body.name.endsWith(".md") ? body.name : `${body.name}.md`,
            }
          : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
      },
    });

    return NextResponse.json({ file });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Cập nhật file thất bại";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
    where: { id: fileId },
    select: { id: true, categoryId: true },
  });
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const access = await assertResourceAccess(
    authResult.userId,
    "convention_category",
    file.categoryId,
    { needEdit: true },
  );
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 403 ? "Không có quyền chỉnh sửa" : "File not found" },
      { status: access.status },
    );
  }

  await prisma.conventionFile.delete({ where: { id: fileId } });
  return NextResponse.json({ ok: true });
}
