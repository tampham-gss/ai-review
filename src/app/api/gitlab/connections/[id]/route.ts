import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { testGitlabConnection } from "@/lib/gitlab/client";
import { normalizeGitlabHost } from "@/lib/utils";
import {
  assertResourceAccess,
  deleteSharesForResource,
} from "@/lib/shares";
import { NextResponse } from "next/server";
import { z } from "zod";

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

  try {
    const body = patchSchema.parse(await request.json());
    const onlyDefault =
      body.isDefault !== undefined &&
      body.name === undefined &&
      body.host === undefined &&
      body.token === undefined;

    const access = await assertResourceAccess(
      authResult.userId,
      "gitlab_connection",
      id,
      { needEdit: !onlyDefault },
    );
    if (!access.ok) {
      return NextResponse.json(
        {
          error:
            access.status === 403
              ? "Không có quyền chỉnh sửa kết nối này"
              : "Connection not found",
        },
        { status: access.status },
      );
    }

    if (body.isDefault && !access.isOwner) {
      return NextResponse.json(
        { error: "Chỉ chủ sở hữu mới đặt mặc định" },
        { status: 403 },
      );
    }

    if (onlyDefault && !access.isOwner) {
      return NextResponse.json(
        { error: "Chỉ chủ sở hữu mới đặt mặc định" },
        { status: 403 },
      );
    }

    const existing = await prisma.gitlabConnection.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    let gitlabUser: { username?: string } | null = null;

    if (!onlyDefault) {
      const nextHost = body.host ? normalizeGitlabHost(body.host) : existing.host;
      const nextToken = body.token ? body.token : decrypt(existing.tokenEncrypted);
      gitlabUser = await testGitlabConnection(nextHost, nextToken);
    }

    if (body.isDefault === true && access.isOwner) {
      await prisma.gitlabConnection.updateMany({
        where: { userId: existing.userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const connection = await prisma.gitlabConnection.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.host !== undefined
          ? { host: normalizeGitlabHost(body.host) }
          : {}),
        ...(body.token !== undefined
          ? { tokenEncrypted: encrypt(body.token) }
          : {}),
        ...(body.isDefault !== undefined && access.isOwner
          ? { isDefault: body.isDefault }
          : {}),
      },
      select: { id: true, name: true, host: true, isDefault: true },
    });

    return NextResponse.json({
      connection: {
        ...connection,
        isOwner: access.isOwner,
        canEdit: access.canEdit,
        ownership: access.isOwner ? "owned" : "shared",
        owner: access.owner,
      },
      user: gitlabUser,
    });
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
  const access = await assertResourceAccess(
    authResult.userId,
    "gitlab_connection",
    id,
  );
  if (!access.ok || !access.isOwner) {
    return NextResponse.json(
      { error: "Chỉ chủ sở hữu mới được xóa" },
      { status: access.ok ? 403 : 404 },
    );
  }

  const existing = await prisma.gitlabConnection.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  await deleteSharesForResource("gitlab_connection", id);
  await prisma.gitlabConnection.delete({ where: { id } });

  if (existing.isDefault) {
    const next = await prisma.gitlabConnection.findFirst({
      where: { userId: authResult.userId },
      orderBy: { createdAt: "desc" },
    });
    if (next) {
      await prisma.gitlabConnection.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
