import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { testGitlabConnection } from "@/lib/gitlab/client";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { id } = await params;
  const connection = await prisma.gitlabConnection.findFirst({
    where: { id, userId: authResult.userId },
  });

  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  try {
    const token = decrypt(connection.tokenEncrypted);
    const user = await testGitlabConnection(connection.host, token);
    return NextResponse.json({
      ok: true,
      message: `Kết nối OK — ${user.username}`,
      user,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Test kết nối thất bại";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
