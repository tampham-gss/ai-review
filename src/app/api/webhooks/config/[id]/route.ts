import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { DEFAULT_TRIGGER_PHRASE } from "@/lib/webhooks/gitlab-auto-validate";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  triggerPhrase: z.string().min(1).max(200).optional(),
  connectionId: z.string().min(1).optional(),
  selectedCategoryIds: z.array(z.string()).optional(),
  aiProviderId: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
  rotateSecret: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const existing = await prisma.webhookAutoValidate.findFirst({
    where: { id, userId: authResult.userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = patchSchema.parse(await request.json());

    if (body.connectionId) {
      const owned = await prisma.gitlabConnection.findFirst({
        where: { id: body.connectionId, userId: authResult.userId },
      });
      if (!owned) {
        return NextResponse.json(
          { error: "GitLab connection không hợp lệ" },
          { status: 400 },
        );
      }
    }

    if (body.aiProviderId) {
      const provider = await prisma.aiProvider.findFirst({
        where: { id: body.aiProviderId, userId: authResult.userId },
      });
      if (!provider) {
        return NextResponse.json(
          { error: "AI provider không hợp lệ" },
          { status: 400 },
        );
      }
    }

    const { generateWebhookSecret } = await import(
      "@/lib/webhooks/gitlab-auto-validate"
    );

    const config = await prisma.webhookAutoValidate.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.triggerPhrase !== undefined
          ? {
              triggerPhrase:
                body.triggerPhrase.trim() || DEFAULT_TRIGGER_PHRASE,
            }
          : {}),
        ...(body.connectionId !== undefined
          ? { connectionId: body.connectionId }
          : {}),
        ...(body.selectedCategoryIds !== undefined
          ? { selectedCategoryIds: body.selectedCategoryIds }
          : {}),
        ...(body.aiProviderId !== undefined
          ? { aiProviderId: body.aiProviderId }
          : {}),
        ...(body.isEnabled !== undefined ? { isEnabled: body.isEnabled } : {}),
        ...(body.rotateSecret ? { secret: generateWebhookSecret() } : {}),
      },
      select: {
        id: true,
        name: true,
        secret: true,
        triggerPhrase: true,
        connectionId: true,
        selectedCategoryIds: true,
        aiProviderId: true,
        isEnabled: true,
        lastTriggeredAt: true,
        lastSessionId: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ config });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Cập nhật thất bại";
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
  const existing = await prisma.webhookAutoValidate.findFirst({
    where: { id, userId: authResult.userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.webhookAutoValidate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
