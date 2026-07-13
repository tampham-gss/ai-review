import { prisma } from "@/lib/db";
import {
  rateProvider,
  type ProviderPerformanceInput,
  type ProviderRating,
} from "@/lib/ai/model-rating";

export async function getProviderRatingsForUser(
  userId: string,
  options?: { since?: Date },
): Promise<ProviderRating[]> {
  const since = options?.since;
  const sessionWhere = {
    userId,
    ...(since ? { createdAt: { gte: since } } : {}),
  };

  const [providers, sessions] = await Promise.all([
    prisma.aiProvider.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        model: true,
      },
    }),
    prisma.reviewSession.findMany({
      where: sessionWhere,
      select: {
        id: true,
        aiProviderId: true,
        status: true,
        commentResults: {
          select: { confidence: true },
        },
      },
    }),
  ]);

  const tokenLogs = await prisma.tokenUsageLog.findMany({
    where: {
      userId,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    select: { providerId: true, tokens: true },
  });

  const tokensByProvider = new Map<string, number>();
  for (const log of tokenLogs) {
    tokensByProvider.set(
      log.providerId,
      (tokensByProvider.get(log.providerId) ?? 0) + log.tokens,
    );
  }

  const byProvider = new Map<
    string,
    {
      sessionCount: number;
      completedSessions: number;
      confidences: number[];
    }
  >();

  for (const session of sessions) {
    if (!session.aiProviderId) continue;
    const bucket = byProvider.get(session.aiProviderId) ?? {
      sessionCount: 0,
      completedSessions: 0,
      confidences: [],
    };
    bucket.sessionCount += 1;
    if (session.status === "completed") bucket.completedSessions += 1;
    for (const c of session.commentResults) {
      if (c.confidence != null) bucket.confidences.push(c.confidence);
    }
    byProvider.set(session.aiProviderId, bucket);
  }

  const ratings = providers.map((p) => {
    const stats = byProvider.get(p.id);
    const avgConfidence =
      stats && stats.confidences.length > 0
        ? stats.confidences.reduce((a, b) => a + b, 0) / stats.confidences.length
        : null;

    const input: ProviderPerformanceInput = {
      providerId: p.id,
      provider: p.provider,
      model: p.model,
      sessionCount: stats?.sessionCount ?? 0,
      completedSessions: stats?.completedSessions ?? 0,
      commentCount: stats?.confidences.length ?? 0,
      avgConfidence,
      tokensUsedInPeriod: tokensByProvider.get(p.id) ?? 0,
    };

    return rateProvider(input);
  });

  return ratings.sort((a, b) => {
    if (b.overallStars !== a.overallStars) return b.overallStars - a.overallStars;
    return b.sampleSize - a.sampleSize;
  });
}
