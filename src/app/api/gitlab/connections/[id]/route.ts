import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { testGitlabConnection } from "@/lib/gitlab/client";
import { normalizeGitlabHost } from "@/lib/utils";
import { NextResponse } from "next/server";
import { z } from "zod";

async function getOwnedConnection(userId: string, id: string) {
  return prisma.gitlabConnection.findFirst({
    where: { id, userId },
  });
}

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  host: z.string().min(3).optional(),
  token: z.string().min(10).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const existing = await getOwnedConnection(authResult.userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  try {
    const body = patchSchema.parse(await request.json());
    const nextHost = body.host ? normalizeGitlabHost(body.host) : existing.host;
    const nextToken = body.token ? body.token : decrypt(existing.tokenEncrypted);

    // Luôn test lại khi đổi host/token; khi chỉ đổi name/default thì test token hiện tại
    const user = await testGitlabConnection(nextHost, nextToken);

    if (body.isDefault === true) {
      await prisma.gitlabConnection.updateMany({
        where: { userId: authResult.userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    if (body.host && nextHost !== existing.host) {
      const conflict = await prisma.gitlabConnection.findFirst({
        where: {
          userId: authResult.userId,
          host: nextHost,
          NOT: { id },
        },
      });
      if (conflict) {
        return NextResponse.json(
          { error: "Đã có kết nối với host này" },
          { status: 400 },
        );
      }
    }

    const connection = await prisma.gitlabConnection.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.host !== undefined ? { host: nextHost } : {}),
        ...(body.token !== undefined
          ? { tokenEncrypted: encrypt(body.token) }
          : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
      },
      select: { id: true, name: true, host: true, isDefault: true },
    });

    return NextResponse.json({ connection, user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Cập nhật kết nối thất bại";
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
  const existing = await getOwnedConnection(authResult.userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  await prisma.gitlabConnection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
