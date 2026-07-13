import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId: session.user.id };
}

export async function getConventionText(
  userId: string,
  categoryIds: string[],
): Promise<string> {
  const { prisma } = await import("@/lib/db");

  if (categoryIds.length === 0) return "Không có convention được chọn.";

  const categories = await prisma.conventionCategory.findMany({
    where: { userId, id: { in: categoryIds } },
    include: { files: true },
  });

  const parts: string[] = [];
  for (const category of categories) {
    parts.push(`### ${category.name} (Level ${category.level})`);
    for (const file of category.files) {
      parts.push(`#### ${file.name}\n${file.content}`);
    }
  }
  return parts.join("\n\n");
}
