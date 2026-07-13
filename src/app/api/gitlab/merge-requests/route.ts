import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { listBranches, listMergeRequests } from "@/lib/gitlab/client";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get("connectionId");
  const projectId = searchParams.get("projectId");
  const type = searchParams.get("type") ?? "mrs";
  const sourceBranch = searchParams.get("branch") ?? undefined;

  if (!connectionId || !projectId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const connection = await prisma.gitlabConnection.findFirst({
    where: { id: connectionId, userId: authResult.userId },
  });
  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const token = decrypt(connection.tokenEncrypted);

  if (type === "branches") {
    const branches = await listBranches(connection.host, token, projectId);
    return NextResponse.json({ branches });
  }

  const mrs = await listMergeRequests(connection.host, token, projectId, sourceBranch);
  return NextResponse.json({ mergeRequests: mrs });
}
