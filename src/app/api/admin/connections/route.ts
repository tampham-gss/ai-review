import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/** Tổng quan connection GitLab — không trả token. */
export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const connections = await prisma.gitlabConnection.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      host: true,
      isDefault: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });

  const byHost = connections.reduce<Record<string, number>>((acc, c) => {
    acc[c.host] = (acc[c.host] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ connections, byHost });
}
