import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import {
  getResourceAccess,
  isResourceType,
  type ResourceType,
} from "@/lib/shares";
import { NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  resourceType: z.string(),
  resourceId: z.string().min(1),
  sharedWithUserId: z.string().min(1),
  canEdit: z.boolean().optional(),
});

export async function GET(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const resourceType = searchParams.get("resourceType");
  const resourceId = searchParams.get("resourceId");

  if (!resourceType || !resourceId || !isResourceType(resourceType)) {
    return NextResponse.json(
      { error: "resourceType và resourceId bắt buộc" },
      { status: 400 },
    );
  }

  const access = await getResourceAccess(
    authResult.userId,
    resourceType,
    resourceId,
  );
  if (!access.ok || !access.isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const shares = await prisma.resourceShare.findMany({
    where: { resourceType, resourceId, ownerUserId: authResult.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      canEdit: true,
      createdAt: true,
      sharedWith: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ shares });
}

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  try {
    const body = createSchema.parse(await request.json());
    if (!isResourceType(body.resourceType)) {
      return NextResponse.json({ error: "resourceType không hợp lệ" }, { status: 400 });
    }

    const resourceType = body.resourceType as ResourceType;

    if (body.sharedWithUserId === authResult.userId) {
      return NextResponse.json(
        { error: "Không thể chia sẻ với chính mình" },
        { status: 400 },
      );
    }

    const access = await getResourceAccess(
      authResult.userId,
      resourceType,
      body.resourceId,
    );
    if (!access.ok || !access.isOwner) {
      return NextResponse.json(
        { error: "Chỉ chủ sở hữu mới được chia sẻ" },
        { status: 403 },
      );
    }

    const target = await prisma.user.findFirst({
      where: { id: body.sharedWithUserId, isDisabled: false },
      select: { id: true, name: true, email: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });
    }

    const share = await prisma.resourceShare.upsert({
      where: {
        resourceType_resourceId_sharedWithUserId: {
          resourceType,
          resourceId: body.resourceId,
          sharedWithUserId: body.sharedWithUserId,
        },
      },
      create: {
        resourceType,
        resourceId: body.resourceId,
        ownerUserId: authResult.userId,
        sharedWithUserId: body.sharedWithUserId,
        canEdit: body.canEdit ?? false,
      },
      update: {
        canEdit: body.canEdit ?? false,
      },
      select: {
        id: true,
        canEdit: true,
        createdAt: true,
        sharedWith: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ share });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Share thất bại";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
