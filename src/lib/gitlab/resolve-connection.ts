import { prisma } from "@/lib/db";
import { findGitlabConnectionForHostAccessible } from "@/lib/shares";

/** Resolve GitLab connection for a host; prefer owned default, then shared. */
export async function findGitlabConnectionForHost(
  userId: string,
  host: string,
) {
  return findGitlabConnectionForHostAccessible(userId, host);
}

/** Resolve by id if owned or shared with user. */
export async function findGitlabConnectionById(
  userId: string,
  connectionId: string,
) {
  const owned = await prisma.gitlabConnection.findFirst({
    where: { id: connectionId, userId },
  });
  if (owned) return owned;

  const { getAccessibleGitlabConnection } = await import("@/lib/shares");
  return getAccessibleGitlabConnection(userId, connectionId);
}
