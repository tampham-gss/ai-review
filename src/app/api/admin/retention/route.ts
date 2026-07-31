import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { getSystemSettings, writeAuditLog } from "@/lib/admin";
import { NextResponse } from "next/server";

/** Xóa session cũ hơn retentionDays (kèm zip/source). */
export async function POST() {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const settings = await getSystemSettings();
  const cutoff = new Date(
    Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000,
  );

  const result = await prisma.reviewSession.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  await writeAuditLog({
    actorUserId: authResult.userId,
    action: "retention.cleanup",
    targetType: "reviewSession",
    meta: { deleted: result.count, cutoff: cutoff.toISOString() },
  });

  return NextResponse.json({
    deleted: result.count,
    cutoff,
    retentionDays: settings.retentionDays,
  });
}
