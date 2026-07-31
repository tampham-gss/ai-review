import { prisma } from "@/lib/db";

export type AuditAction =
  | "admin.login"
  | "user.disable"
  | "user.enable"
  | "user.role_change"
  | "user.quota_change"
  | "user.delete"
  | "settings.update"
  | "session.mark_failed"
  | "session.delete"
  | "retention.cleanup"
  | "shared_convention.create"
  | "shared_convention.update"
  | "shared_convention.delete"
  | "shared_ai.create"
  | "shared_ai.update"
  | "shared_ai.delete";

export async function writeAuditLog(params: {
  actorUserId?: string | null;
  action: AuditAction | string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId ?? null,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        metaJson: params.meta ? JSON.stringify(params.meta) : null,
      },
    });
  } catch (error) {
    console.error("[audit]", error);
  }
}

export async function getSystemSettings() {
  return prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      registrationOpen: true,
      maintenanceMode: false,
      retentionDays: 90,
    },
  });
}

export async function getUserMonthlyTokenUsage(userId: string) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const agg = await prisma.tokenUsageLog.aggregate({
    where: { userId, createdAt: { gte: start } },
    _sum: { tokens: true },
  });
  return agg._sum.tokens ?? 0;
}
