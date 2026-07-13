import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { testGitlabConnection } from "@/lib/gitlab/client";
import { normalizeGitlabHost } from "@/lib/utils";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const hasDefault = await prisma.gitlabConnection.findFirst({
    where: { userId: authResult.userId, isDefault: true },
    select: { id: true },
  });

  if (!hasDefault) {
    const newest = await prisma.gitlabConnection.findFirst({
      where: { userId: authResult.userId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (newest) {
      await prisma.gitlabConnection.update({
        where: { id: newest.id },
        data: { isDefault: true },
      });
    }
  }

  const connections = await prisma.gitlabConnection.findMany({
    where: { userId: authResult.userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, host: true, isDefault: true, createdAt: true },
  });

  return NextResponse.json({ connections });
}

const createSchema = z.object({
  name: z.string().min(2),
  host: z.string().min(3),
  token: z.string().min(10),
  isDefault: z.boolean().optional(),
});

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  try {
    const body = createSchema.parse(await request.json());
    const host = normalizeGitlabHost(body.host);
    const user = await testGitlabConnection(host, body.token);

    const existingCount = await prisma.gitlabConnection.count({
      where: { userId: authResult.userId },
    });
    const makeDefault = body.isDefault === true || existingCount === 0;

    if (makeDefault) {
      await prisma.gitlabConnection.updateMany({
        where: { userId: authResult.userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const connection = await prisma.gitlabConnection.create({
      data: {
        userId: authResult.userId,
        name: body.name,
        host,
        tokenEncrypted: encrypt(body.token),
        isDefault: makeDefault,
      },
      select: { id: true, name: true, host: true, isDefault: true },
    });

    return NextResponse.json({ connection, user });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không thể kết nối GitLab";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
