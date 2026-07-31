import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { getSystemSettings, writeAuditLog } from "@/lib/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  registrationOpen: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  announcement: z.string().max(2000).nullable().optional(),
  defaultMonthlyTokenQuota: z.number().int().positive().nullable().optional(),
  retentionDays: z.number().int().min(7).max(3650).optional(),
});

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;
  const settings = await getSystemSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  let data;
  try {
    data = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      registrationOpen: data.registrationOpen ?? true,
      maintenanceMode: data.maintenanceMode ?? false,
      announcement: data.announcement ?? null,
      defaultMonthlyTokenQuota: data.defaultMonthlyTokenQuota ?? null,
      retentionDays: data.retentionDays ?? 90,
    },
    update: {
      ...(data.registrationOpen !== undefined
        ? { registrationOpen: data.registrationOpen }
        : {}),
      ...(data.maintenanceMode !== undefined
        ? { maintenanceMode: data.maintenanceMode }
        : {}),
      ...(data.announcement !== undefined
        ? { announcement: data.announcement }
        : {}),
      ...(data.defaultMonthlyTokenQuota !== undefined
        ? { defaultMonthlyTokenQuota: data.defaultMonthlyTokenQuota }
        : {}),
      ...(data.retentionDays !== undefined
        ? { retentionDays: data.retentionDays }
        : {}),
    },
  });

  await writeAuditLog({
    actorUserId: authResult.userId,
    action: "settings.update",
    targetType: "systemSettings",
    targetId: "default",
    meta: data,
  });

  return NextResponse.json({ settings });
}
