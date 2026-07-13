import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { testAiConnection } from "@/lib/ai/providers";
import { getProviderRatingsForUser } from "@/lib/ai/provider-ratings";
import { aiProviderCreateSchema } from "@/lib/ai/schemas";
import type { AiProviderName } from "@/lib/ai/provider-registry";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const [providers, ratings] = await Promise.all([
    prisma.aiProvider.findMany({
      where: { userId: authResult.userId },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
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
    }),
    getProviderRatingsForUser(authResult.userId),
  ]);

  const ratingById = new Map(ratings.map((r) => [r.providerId, r]));

  return NextResponse.json({
    providers: providers.map((p) => {
      const rating = ratingById.get(p.id);
      return {
        ...p,
        remaining: p.tokenLimit ? Math.max(0, p.tokenLimit - p.tokensUsed) : null,
        rating: rating
          ? {
              overallStars: rating.overallStars,
              capabilityStars: rating.capabilityStars,
              performanceStars: rating.performanceStars,
              label: rating.label,
              reason: rating.reason,
              sampleSize: rating.sampleSize,
            }
          : null,
      };
    }),
    bestProviderId: ratings[0]?.providerId ?? null,
  });
}

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  try {
    const body = aiProviderCreateSchema.parse(await request.json());

    await testAiConnection({
      provider: body.provider as AiProviderName,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      model: body.model ?? undefined,
    });

    if (body.isDefault) {
      await prisma.aiProvider.updateMany({
        where: { userId: authResult.userId },
        data: { isDefault: false },
      });
    }

    const provider = await prisma.aiProvider.create({
      data: {
        userId: authResult.userId,
        provider: body.provider,
        apiKeyEncrypted: encrypt(body.apiKey || "ollama"),
        baseUrl: body.baseUrl ?? null,
        model: body.model,
        tokenLimit: body.tokenLimit ?? null,
        priority: body.priority ?? 0,
        isDefault: body.isDefault ?? false,
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
        ...provider,
        remaining: provider.tokenLimit
          ? Math.max(0, provider.tokenLimit - provider.tokensUsed)
          : null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Thêm provider thất bại";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
