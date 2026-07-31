import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { getSystemSettings } from "@/lib/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [
    userCount,
    adminCount,
    disabledCount,
    sessionCount,
    validatingCount,
    failedCount,
    tokensMonth,
    tokensDay,
    connectionCount,
    settings,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.user.count({ where: { isDisabled: true } }),
    prisma.reviewSession.count(),
    prisma.reviewSession.count({ where: { status: "validating" } }),
    prisma.reviewSession.count({
      where: { status: { in: ["failed", "cancelled"] } },
    }),
    prisma.tokenUsageLog.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { tokens: true },
    }),
    prisma.tokenUsageLog.aggregate({
      where: { createdAt: { gte: dayAgo } },
      _sum: { tokens: true },
    }),
    prisma.gitlabConnection.count(),
    getSystemSettings(),
  ]);

  return NextResponse.json({
    overview: {
      userCount,
      adminCount,
      disabledCount,
      sessionCount,
      validatingCount,
      failedCount,
      tokensMonth: tokensMonth._sum.tokens ?? 0,
      tokensDay: tokensDay._sum.tokens ?? 0,
      connectionCount,
    },
    settings,
  });
}
