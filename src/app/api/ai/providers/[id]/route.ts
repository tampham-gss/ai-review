import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { testAiConnection } from "@/lib/ai/providers";
import { aiProviderPatchSchema } from "@/lib/ai/schemas";
import type { AiProviderName } from "@/lib/ai/provider-registry";
import {
  assertResourceAccess,
  deleteSharesForResource,
} from "@/lib/shares";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;

  try {
    const access = await assertResourceAccess(
      authResult.userId,
      "ai_provider",
      id,
      { needEdit: true },
    );
    if (!access.ok) {
      return NextResponse.json(
        {
          error:
            access.status === 403
              ? "Không có quyền chỉnh sửa provider này"
              : "Provider not found",
        },
        { status: access.status },
      );
    }

    const existing = await prisma.aiProvider.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const body = aiProviderPatchSchema.parse(await request.json());

    // isDefault chỉ áp dụng cho owner (tránh đổi default của người khác)
    if (body.isDefault && !access.isOwner) {
      return NextResponse.json(
        { error: "Chỉ chủ sở hữu mới đặt mặc định" },
        { status: 403 },
      );
    }

    const providerType = (body.provider ?? existing.provider) as AiProviderName;
    const baseUrl = body.baseUrl === undefined ? existing.baseUrl : body.baseUrl;
    const model = body.model === undefined ? existing.model : body.model;

    const shouldTest =
      !!body.apiKey ||
      body.provider !== undefined ||
      body.model !== undefined ||
      body.baseUrl !== undefined;

    if (shouldTest) {
      const apiKey = body.apiKey ?? decrypt(existing.apiKeyEncrypted);
      await testAiConnection({
        provider: providerType,
        apiKey,
        baseUrl,
        model: model ?? undefined,
      });
    }

    if (body.isDefault) {
      await prisma.aiProvider.updateMany({
        where: { userId: existing.userId },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.aiProvider.update({
      where: { id },
      data: {
        ...(body.provider !== undefined ? { provider: body.provider } : {}),
        ...(body.apiKey ? { apiKeyEncrypted: encrypt(body.apiKey) } : {}),
        ...(body.baseUrl !== undefined ? { baseUrl: body.baseUrl } : {}),
        ...(body.model !== undefined ? { model: body.model } : {}),
        ...(body.tokenLimit !== undefined ? { tokenLimit: body.tokenLimit } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.isDefault !== undefined && access.isOwner
          ? { isDefault: body.isDefault }
          : {}),
        ...(body.isEnabled !== undefined ? { isEnabled: body.isEnabled } : {}),
      },
      select: {
        id: true,
        provider: true,
        baseUrl: true,
        model: true,
        isDefault: true,
        isEnabled: true,
        tokenLimit: true,
        tokensUsed: true,
        priority: true,
      },
    });

    return NextResponse.json({
      provider: {
        ...updated,
        remaining: updated.tokenLimit
          ? Math.max(0, updated.tokenLimit - updated.tokensUsed)
          : null,
        isOwner: access.isOwner,
        canEdit: true,
        ownership: access.isOwner ? "owned" : "shared",
        owner: access.owner,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
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
  const access = await assertResourceAccess(
    authResult.userId,
    "ai_provider",
    id,
  );
  if (!access.ok || !access.isOwner) {
    return NextResponse.json(
      { error: "Chỉ chủ sở hữu mới được xóa" },
      { status: access.ok ? 403 : 404 },
    );
  }

  const existing = await prisma.aiProvider.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  await deleteSharesForResource("ai_provider", id);
  await prisma.aiProvider.delete({ where: { id } });

  if (existing.isDefault) {
    const next = await prisma.aiProvider.findFirst({
      where: { userId: authResult.userId },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    if (next) {
      await prisma.aiProvider.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
