import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { listProjects } from "@/lib/gitlab/client";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get("connectionId");
  const search = searchParams.get("search") ?? undefined;

  if (!connectionId) {
    return NextResponse.json({ error: "connectionId required" }, { status: 400 });
  }

  const connection = await prisma.gitlabConnection.findFirst({
    where: { id: connectionId, userId: authResult.userId },
  });
  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const token = decrypt(connection.tokenEncrypted);
  const projects = await listProjects(connection.host, token, search);
  return NextResponse.json({ projects });
}
