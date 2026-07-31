import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import {
  DEFAULT_TRIGGER_PHRASE,
  generateWebhookSecret,
} from "@/lib/webhooks/gitlab-auto-validate";
import { NextResponse } from "next/server";
import { z } from "zod";

function publicSelect() {
  return {
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
  } as const;
}

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const configs = await prisma.webhookAutoValidate.findMany({
    where: { userId: authResult.userId },
    orderBy: { createdAt: "desc" },
    select: publicSelect(),
  });

  const appUrl =
    process.env.AUTH_URL?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    "";

  return NextResponse.json({
    configs,
    webhookUrl: appUrl ? `${appUrl}/api/webhooks/gitlab` : "/api/webhooks/gitlab",
    defaultTriggerPhrase: DEFAULT_TRIGGER_PHRASE,
  });
}

const createSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  triggerPhrase: z.string().min(1).max(200).optional(),
  connectionId: z.string().min(1),
  selectedCategoryIds: z.array(z.string()).default([]),
  aiProviderId: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
});

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  try {
    const body = createSchema.parse(await request.json());
    const owned = await prisma.gitlabConnection.findFirst({
      where: { id: body.connectionId, userId: authResult.userId },
    });
    if (!owned) {
      return NextResponse.json(
        { error: "Chỉ dùng GitLab connection của bạn cho webhook" },
        { status: 400 },
      );
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

    const config = await prisma.webhookAutoValidate.create({
      data: {
        userId: authResult.userId,
        name: body.name ?? "GitLab auto validate",
        secret: generateWebhookSecret(),
        triggerPhrase: body.triggerPhrase?.trim() || DEFAULT_TRIGGER_PHRASE,
        connectionId: body.connectionId,
        selectedCategoryIds: body.selectedCategoryIds,
        aiProviderId: body.aiProviderId ?? null,
        isEnabled: body.isEnabled ?? true,
      },
      select: publicSelect(),
    });

    return NextResponse.json({ config });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Tạo webhook thất bại";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
