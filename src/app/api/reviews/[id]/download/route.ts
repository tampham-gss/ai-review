import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const session = await prisma.reviewSession.findFirst({
    where: { id, userId: authResult.userId },
  });

  if (!session?.fixedSourceData) {
    return NextResponse.json({ error: "Chưa có source đã fix" }, { status: 404 });
  }

  return new NextResponse(Buffer.from(session.fixedSourceData), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="fixed-source-${session.projectPath.replace(/\//g, "-")}-mr${session.mrIid}.zip"`,
    },
  });
}
