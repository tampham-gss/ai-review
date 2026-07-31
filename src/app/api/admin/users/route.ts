import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { getUserMonthlyTokenUsage } from "@/lib/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isDisabled: true,
      monthlyTokenQuota: true,
      createdAt: true,
      _count: {
        select: {
          reviewSessions: true,
          gitlabConnections: true,
          aiProviders: true,
        },
      },
    },
  });

  const withUsage = await Promise.all(
    users.map(async (u) => ({
      ...u,
      tokensThisMonth: await getUserMonthlyTokenUsage(u.id),
    })),
  );

  return NextResponse.json({ users: withUsage });
}
