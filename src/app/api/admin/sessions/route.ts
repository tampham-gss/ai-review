import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const take = Math.min(Number(searchParams.get("take") ?? 50), 200);

  const sessions = await prisma.reviewSession.findMany({
    where: status ? { status } : undefined,
    orderBy: { updatedAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      projectPath: true,
      mrIid: true,
      gitlabHost: true,
      sourceBranch: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, email: true, name: true } },
      _count: { select: { commentResults: true } },
    },
  });

  return NextResponse.json({ sessions });
}
