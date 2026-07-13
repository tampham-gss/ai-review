import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const take = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 100);
  const skip = Math.max(Number(searchParams.get("offset") ?? 0) || 0, 0);

  const [sessions, total] = await Promise.all([
    prisma.reviewSession.findMany({
      where: { userId: authResult.userId },
      orderBy: { updatedAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        projectPath: true,
        mrIid: true,
        mrTitle: true,
        sourceBranch: true,
        sourceType: true,
        status: true,
        selectedCategoryIds: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: { id: true, name: true, email: true },
        },
        commentResults: {
          select: { id: true, verdict: true },
        },
      },
    }),
    prisma.reviewSession.count({ where: { userId: authResult.userId } }),
  ]);

  return NextResponse.json({
    total,
    sessions: sessions.map((s) => ({
      id: s.id,
      projectPath: s.projectPath,
      mrIid: s.mrIid,
      mrTitle: s.mrTitle,
      sourceBranch: s.sourceBranch,
      sourceType: s.sourceType,
      status: s.status,
      selectedCategoryIds: s.selectedCategoryIds,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      user: s.user,
      validCount: s.commentResults.filter((c) => c.verdict === "VALID").length,
      invalidCount: s.commentResults.filter((c) => c.verdict === "INVALID").length,
      partialCount: s.commentResults.filter((c) => c.verdict === "PARTIAL").length,
      commentCount: s.commentResults.length,
    })),
  });
}
