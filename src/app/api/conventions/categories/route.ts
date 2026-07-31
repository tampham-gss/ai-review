import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { getSharesReceivedMap, listSharedResourceIds } from "@/lib/shares";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const sharedIds = await listSharedResourceIds(
    authResult.userId,
    "convention_category",
  );
  const receivedMap = await getSharesReceivedMap(
    authResult.userId,
    "convention_category",
  );

  const categories = await prisma.conventionCategory.findMany({
    where: {
      OR: [
        { userId: authResult.userId },
        ...(sharedIds.length > 0 ? [{ id: { in: sharedIds } }] : []),
      ],
    },
    include: {
      files: true,
      children: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({
    categories: categories.map((c) => {
      const isOwner = c.userId === authResult.userId;
      const share = receivedMap.get(c.id);
      return {
        ...c,
        ownership: isOwner ? "owned" : "shared",
        canEdit: isOwner || !!share?.canEdit,
        isOwner,
        owner: c.user,
      };
    }),
  });
}

const categorySchema = z.object({
  name: z.string().min(2),
  level: z.number().int().min(1).max(10),
  parentId: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const body = categorySchema.parse(await request.json());
  const category = await prisma.conventionCategory.create({
    data: {
      userId: authResult.userId,
      name: body.name,
      level: body.level,
      parentId: body.parentId ?? null,
    },
  });

  return NextResponse.json({ category });
}
