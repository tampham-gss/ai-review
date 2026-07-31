import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { writeAuditLog } from "@/lib/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  provider: z.string().min(1),
  apiKey: z.string().min(8),
  baseUrl: z.string().url().optional().nullable(),
  model: z.string().optional().nullable(),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  tokenLimit: z.number().int().positive().optional().nullable(),
});

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const providers = await prisma.sharedAiProvider.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      provider: true,
      baseUrl: true,
      model: true,
      isEnabled: true,
      priority: true,
      tokenLimit: true,
      tokensUsed: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ providers });
}

export async function POST(request: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  let data;
  try {
    data = createSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const provider = await prisma.sharedAiProvider.create({
    data: {
      name: data.name,
      provider: data.provider,
      apiKeyEncrypted: encrypt(data.apiKey),
      baseUrl: data.baseUrl ?? null,
      model: data.model ?? null,
      isEnabled: data.isEnabled ?? true,
      priority: data.priority ?? 0,
      tokenLimit: data.tokenLimit ?? null,
    },
    select: {
      id: true,
      name: true,
      provider: true,
      baseUrl: true,
      model: true,
      isEnabled: true,
      priority: true,
      tokenLimit: true,
      tokensUsed: true,
    },
  });

  await writeAuditLog({
    actorUserId: authResult.userId,
    action: "shared_ai.create",
    targetType: "sharedAiProvider",
    targetId: provider.id,
  });

  return NextResponse.json({ provider });
}
