import { prisma } from "@/lib/db";

/** Resolve GitLab connection for a host; prefer default, then newest. */
export async function findGitlabConnectionForHost(
  userId: string,
  host: string,
) {
  return prisma.gitlabConnection.findFirst({
    where: { userId, host },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
}
