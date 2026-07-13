import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { getProviderRatingsForUser } from "@/lib/ai/provider-ratings";
import {
  buildBuckets,
  getRangeBounds,
  rangeLabel,
  type StatsRange,
} from "@/lib/stats";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get("range") ?? "week";
  const range: StatsRange =
    rangeParam === "day" || rangeParam === "month" ? rangeParam : "week";

  const { start, end } = getRangeBounds(range);
  const userId = authResult.userId;

  const [sessions, comments, tokenLogs, providers, modelRatings] =
    await Promise.all([
      prisma.reviewSession.findMany({
        where: { userId, createdAt: { gte: start, lte: end } },
        select: {
          id: true,
          status: true,
          projectPath: true,
          createdAt: true,
        },
      }),
      prisma.commentValidationResult.findMany({
        where: {
          session: { userId },
          createdAt: { gte: start, lte: end },
        },
        select: {
          verdict: true,
          pushedToGitlab: true,
          createdAt: true,
        },
      }),
      prisma.tokenUsageLog.findMany({
        where: { userId, createdAt: { gte: start, lte: end } },
        select: {
          tokens: true,
          action: true,
          createdAt: true,
          providerId: true,
        },
      }),
      prisma.aiProvider.findMany({
        where: { userId },
        select: {
          id: true,
          provider: true,
          model: true,
          tokensUsed: true,
          tokenLimit: true,
        },
      }),
      getProviderRatingsForUser(userId, { since: start }),
    ]);

  const buckets = buildBuckets(range, start, end);

  const timeline = buckets.map((bucket) => {
    const sessionCount = sessions.filter(
      (s) => s.createdAt >= bucket.start && s.createdAt < bucket.end,
    ).length;
    const commentCount = comments.filter(
      (c) => c.createdAt >= bucket.start && c.createdAt < bucket.end,
    ).length;
    const tokens = tokenLogs
      .filter((t) => t.createdAt >= bucket.start && t.createdAt < bucket.end)
      .reduce((sum, t) => sum + t.tokens, 0);

    return {
      key: bucket.key,
      label: bucket.label,
      sessions: sessionCount,
      comments: commentCount,
      tokens,
    };
  });

  const verdicts = {
    VALID: comments.filter((c) => c.verdict === "VALID").length,
    INVALID: comments.filter((c) => c.verdict === "INVALID").length,
    PARTIAL: comments.filter((c) => c.verdict === "PARTIAL").length,
    OTHER: comments.filter(
      (c) =>
        c.verdict &&
        !["VALID", "INVALID", "PARTIAL"].includes(c.verdict),
    ).length,
  };

  const statusCounts = {
    completed: sessions.filter((s) => s.status === "completed").length,
    cancelled: sessions.filter((s) => s.status === "cancelled").length,
    validating: sessions.filter((s) => s.status === "validating").length,
    pending: sessions.filter((s) => s.status === "pending").length,
  };

  const projectMap = new Map<string, number>();
  for (const s of sessions) {
    projectMap.set(s.projectPath, (projectMap.get(s.projectPath) ?? 0) + 1);
  }
  const topProjects = [...projectMap.entries()]
    .map(([projectPath, count]) => ({ projectPath, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const tokensByAction = {
    validate: tokenLogs
      .filter((t) => t.action === "validate")
      .reduce((sum, t) => sum + t.tokens, 0),
    fix: tokenLogs
      .filter((t) => t.action === "fix")
      .reduce((sum, t) => sum + t.tokens, 0),
  };

  return NextResponse.json({
    range,
    rangeLabel: rangeLabel(range),
    start: start.toISOString(),
    end: end.toISOString(),
    summary: {
      sessions: sessions.length,
      comments: comments.length,
      tokens: tokenLogs.reduce((sum, t) => sum + t.tokens, 0),
      pushedReplies: comments.filter((c) => c.pushedToGitlab).length,
      lifetimeTokens: providers.reduce((sum, p) => sum + p.tokensUsed, 0),
    },
    verdicts,
    statusCounts,
    tokensByAction,
    topProjects,
    timeline,
    providers: providers.map((p) => ({
      id: p.id,
      provider: p.provider,
      model: p.model,
      tokensUsed: p.tokensUsed,
      tokenLimit: p.tokenLimit,
      remaining: p.tokenLimit
        ? Math.max(0, p.tokenLimit - p.tokensUsed)
        : null,
    })),
    modelRatings,
    bestModel: modelRatings[0] ?? null,
  });
}
