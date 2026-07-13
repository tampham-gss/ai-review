import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { getProviderMeta } from "@/lib/ai/provider-registry";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  aiProviderId: z.string().optional(),
});

async function getAiProviderSummary(userId: string, aiProviderId: string | null) {
  if (!aiProviderId) return null;

  const provider = await prisma.aiProvider.findFirst({
    where: { id: aiProviderId, userId },
    select: {
      id: true,
      provider: true,
      model: true,
      isDefault: true,
      isEnabled: true,
      tokenLimit: true,
      tokensUsed: true,
    },
  });

  if (!provider) return null;

  return {
    ...provider,
    label: getProviderMeta(provider.provider)?.label ?? provider.provider,
    remaining: provider.tokenLimit
      ? Math.max(0, provider.tokenLimit - provider.tokensUsed)
      : null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const session = await prisma.reviewSession.findFirst({
    where: { id, userId: authResult.userId },
    include: {
      commentResults: { orderBy: { createdAt: "asc" } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const aiProvider = await getAiProviderSummary(
    authResult.userId,
    session.aiProviderId,
  );

  const { zipData: _zip, fixedSourceData: _fixed, ...safeSession } = session;
  void _zip;
  void _fixed;

  return NextResponse.json({
    session: {
      ...safeSession,
      aiProvider,
      zipWarning: session.sourceType === "zip",
      hasFixedSource: !!session.fixedSourceData,
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;

  try {
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.reviewSession.findFirst({
      where: { id, userId: authResult.userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (body.aiProviderId) {
      const provider = await prisma.aiProvider.findFirst({
        where: {
          id: body.aiProviderId,
          userId: authResult.userId,
          isEnabled: true,
        },
      });
      if (!provider) {
        return NextResponse.json({ error: "AI provider không hợp lệ" }, { status: 400 });
      }
    }

    const updated = await prisma.reviewSession.update({
      where: { id },
      data: {
        ...(body.aiProviderId !== undefined ? { aiProviderId: body.aiProviderId } : {}),
      },
    });

    const aiProvider = await getAiProviderSummary(
      authResult.userId,
      updated.aiProviderId,
    );

    return NextResponse.json({ session: { ...updated, aiProvider } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Cập nhật thất bại";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
