import { prisma } from "@/lib/db";

export const RESOURCE_TYPES = [
  "convention_category",
  "ai_provider",
  "gitlab_connection",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export function isResourceType(value: string): value is ResourceType {
  return (RESOURCE_TYPES as readonly string[]).includes(value);
}

const ownerSelect = {
  id: true,
  name: true,
  email: true,
} as const;

export type ShareOwner = {
  id: string;
  name: string | null;
  email: string;
};

export type AccessResult =
  | { ok: true; isOwner: true; canEdit: true; owner: ShareOwner }
  | {
      ok: true;
      isOwner: false;
      canEdit: boolean;
      shareId: string;
      owner: ShareOwner;
    }
  | { ok: false };

async function getResourceOwnerId(
  resourceType: ResourceType,
  resourceId: string,
): Promise<{ ownerUserId: string; owner: ShareOwner } | null> {
  if (resourceType === "convention_category") {
    const row = await prisma.conventionCategory.findUnique({
      where: { id: resourceId },
      select: { userId: true, user: { select: ownerSelect } },
    });
    if (!row) return null;
    return { ownerUserId: row.userId, owner: row.user };
  }
  if (resourceType === "ai_provider") {
    const row = await prisma.aiProvider.findUnique({
      where: { id: resourceId },
      select: { userId: true, user: { select: ownerSelect } },
    });
    if (!row) return null;
    return { ownerUserId: row.userId, owner: row.user };
  }
  const row = await prisma.gitlabConnection.findUnique({
    where: { id: resourceId },
    select: { userId: true, user: { select: ownerSelect } },
  });
  if (!row) return null;
  return { ownerUserId: row.userId, owner: row.user };
}

/** Kiểm tra quyền xem / chỉnh sửa resource đã share. */
export async function getResourceAccess(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
): Promise<AccessResult> {
  const owned = await getResourceOwnerId(resourceType, resourceId);
  if (!owned) return { ok: false };

  if (owned.ownerUserId === userId) {
    return { ok: true, isOwner: true, canEdit: true, owner: owned.owner };
  }

  const share = await prisma.resourceShare.findUnique({
    where: {
      resourceType_resourceId_sharedWithUserId: {
        resourceType,
        resourceId,
        sharedWithUserId: userId,
      },
    },
    select: { id: true, canEdit: true },
  });

  if (!share) return { ok: false };

  return {
    ok: true,
    isOwner: false,
    canEdit: share.canEdit,
    shareId: share.id,
    owner: owned.owner,
  };
}

export async function assertResourceAccess(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  options?: { needEdit?: boolean },
): Promise<AccessResult & { ok: true } | { ok: false; status: 403 | 404 }> {
  const access = await getResourceAccess(userId, resourceType, resourceId);
  if (!access.ok) return { ok: false, status: 404 };
  if (options?.needEdit && !access.canEdit) {
    return { ok: false, status: 403 };
  }
  return access;
}

export async function listSharedResourceIds(
  userId: string,
  resourceType: ResourceType,
): Promise<string[]> {
  const shares = await prisma.resourceShare.findMany({
    where: { sharedWithUserId: userId, resourceType },
    select: { resourceId: true },
  });
  return shares.map((s) => s.resourceId);
}

export async function getSharesReceivedMap(
  userId: string,
  resourceType: ResourceType,
) {
  const shares = await prisma.resourceShare.findMany({
    where: { sharedWithUserId: userId, resourceType },
    select: {
      id: true,
      resourceId: true,
      canEdit: true,
      owner: { select: ownerSelect },
    },
  });
  return new Map(
    shares.map((s) => [
      s.resourceId,
      { shareId: s.id, canEdit: s.canEdit, owner: s.owner },
    ]),
  );
}

export async function deleteSharesForResource(
  resourceType: ResourceType,
  resourceId: string,
) {
  await prisma.resourceShare.deleteMany({
    where: { resourceType, resourceId },
  });
}

/** GitLab connection mà user sở hữu hoặc được share. */
export async function getAccessibleGitlabConnection(
  userId: string,
  connectionId: string,
) {
  const access = await getResourceAccess(
    userId,
    "gitlab_connection",
    connectionId,
  );
  if (!access.ok) return null;
  return prisma.gitlabConnection.findUnique({ where: { id: connectionId } });
}

export async function findGitlabConnectionForHostAccessible(
  userId: string,
  host: string,
) {
  const owned = await prisma.gitlabConnection.findFirst({
    where: { userId, host },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  if (owned) return owned;

  const sharedIds = await listSharedResourceIds(userId, "gitlab_connection");
  if (sharedIds.length === 0) return null;

  return prisma.gitlabConnection.findFirst({
    where: { id: { in: sharedIds }, host },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
}
