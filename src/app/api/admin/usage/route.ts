import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") ?? "month";
  const days = range === "day" ? 1 : range === "week" ? 7 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [byUser, byAction, timeline] = await Promise.all([
    prisma.tokenUsageLog.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: since } },
      _sum: { tokens: true },
      _count: true,
      orderBy: { _sum: { tokens: "desc" } },
      take: 30,
    }),
    prisma.tokenUsageLog.groupBy({
      by: ["action"],
      where: { createdAt: { gte: since } },
      _sum: { tokens: true },
      _count: true,
    }),
    prisma.$queryRaw<Array<{ day: Date; tokens: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day, SUM(tokens)::bigint AS tokens
      FROM "TokenUsageLog"
      WHERE "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  ]);

  const userIds = byUser.map((u) => u.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    range,
    byUser: byUser.map((row) => ({
      userId: row.userId,
      email: userMap.get(row.userId)?.email ?? "?",
      name: userMap.get(row.userId)?.name ?? null,
      tokens: row._sum.tokens ?? 0,
      events: row._count,
    })),
    byAction: byAction.map((row) => ({
      action: row.action,
      tokens: row._sum.tokens ?? 0,
      events: row._count,
    })),
    timeline: timeline.map((row) => ({
      day: row.day,
      tokens: Number(row.tokens),
    })),
  });
}
