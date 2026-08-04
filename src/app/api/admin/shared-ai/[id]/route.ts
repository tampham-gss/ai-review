import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { writeAuditLog } from "@/lib/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  apiKey: z.string().min(8).optional(),
  baseUrl: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  model: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  tokenLimit: z.number().int().positive().nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;

  let data;
  try {
    data = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const provider = await prisma.sharedAiProvider.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.provider !== undefined ? { provider: data.provider } : {}),
      ...(data.apiKey !== undefined
        ? { apiKeyEncrypted: encrypt(data.apiKey) }
        : {}),
      ...(data.baseUrl !== undefined ? { baseUrl: data.baseUrl } : {}),
      ...(data.model !== undefined ? { model: data.model } : {}),
      ...(data.isEnabled !== undefined ? { isEnabled: data.isEnabled } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.tokenLimit !== undefined ? { tokenLimit: data.tokenLimit } : {}),
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
    action: "shared_ai.update",
    targetType: "sharedAiProvider",
    targetId: id,
  });

  return NextResponse.json({ provider });
}

export async function DELETE(_request: Request, { params }: Params) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;

  await prisma.sharedAiProvider.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: authResult.userId,
    action: "shared_ai.delete",
    targetType: "sharedAiProvider",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
