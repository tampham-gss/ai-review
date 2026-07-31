import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getSystemSettings, getUserMonthlyTokenUsage } from "@/lib/admin";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return {
    userId: session.user.id,
    role: (session.user.role === "admin" ? "admin" : "user") as "user" | "admin",
    session,
  };
}

export async function requireAdmin() {
  const result = await requireUser();
  if ("error" in result) return result;
  if (result.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return result;
}

/** Chặn thao tác validate/push khi bảo trì hoặc hết quota (admin bỏ qua). */
export async function assertUserCanOperate(
  userId: string,
  role: "user" | "admin",
) {
  if (role === "admin") return null;

  const settings = await getSystemSettings();
  if (settings.maintenanceMode) {
    return NextResponse.json(
      { error: "Hệ thống đang bảo trì. Vui lòng quay lại sau." },
      { status: 503 },
    );
  }

  const { prisma } = await import("@/lib/db");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isDisabled: true, monthlyTokenQuota: true },
  });
  if (!user || user.isDisabled) {
    return NextResponse.json({ error: "Tài khoản đã bị khóa" }, { status: 403 });
  }

  const quota = user.monthlyTokenQuota ?? settings.defaultMonthlyTokenQuota;
  if (quota != null && quota > 0) {
    const used = await getUserMonthlyTokenUsage(userId);
    if (used >= quota) {
      return NextResponse.json(
        {
          error: `Đã vượt hạn mức token tháng này (${used.toLocaleString()}/${quota.toLocaleString()}). Liên hệ admin.`,
        },
        { status: 429 },
      );
    }
  }

  return null;
}

export async function getConventionText(
  userId: string,
  categoryIds: string[],
): Promise<string> {
  const { prisma } = await import("@/lib/db");
  const { listSharedResourceIds } = await import("@/lib/shares");

  const parts: string[] = [];

  if (categoryIds.length > 0) {
    const sharedIds = await listSharedResourceIds(
      userId,
      "convention_category",
    );
    const categories = await prisma.conventionCategory.findMany({
      where: {
        id: { in: categoryIds },
        OR: [
          { userId },
          ...(sharedIds.length > 0 ? [{ id: { in: sharedIds } }] : []),
        ],
      },
      include: {
        files: true,
        user: { select: { name: true, email: true } },
      },
    });
    for (const category of categories) {
      const ownerLabel =
        category.userId === userId
          ? ""
          : ` — từ ${category.user.name || category.user.email}`;
      parts.push(
        `### ${category.name} (Level ${category.level})${ownerLabel}`,
      );
      for (const file of category.files) {
        parts.push(`#### ${file.name}\n${file.content}`);
      }
    }
  }

  const shared = await prisma.sharedConventionCategory.findMany({
    where: { isEnabled: true },
    include: { files: true },
    orderBy: { level: "asc" },
  });
  for (const category of shared) {
    parts.push(`### [Shared] ${category.name} (Level ${category.level})`);
    for (const file of category.files) {
      parts.push(`#### ${file.name}\n${file.content}`);
    }
  }

  if (parts.length === 0) return "Không có convention được chọn.";
  return parts.join("\n\n");
}
