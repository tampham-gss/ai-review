import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const take = Math.min(
    Number(new URL(request.url).searchParams.get("take") ?? 100),
    300,
  );

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: {
      actor: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ logs });
}
