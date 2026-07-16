import { PrismaClient } from "@prisma/client";

/** Bump khi đổi prisma/schema.prisma — buộc tạo client mới sau restart */
const PRISMA_SCHEMA_VERSION = "2026-07-fix-reply-ready";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaVersion?: string;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getPrismaClient(): PrismaClient {
  const stale =
    globalForPrisma.prismaSchemaVersion !== PRISMA_SCHEMA_VERSION;

  if (!globalForPrisma.prisma || stale) {
    if (globalForPrisma.prisma) {
      void globalForPrisma.prisma.$disconnect();
    }
    globalForPrisma.prisma = createPrismaClient();
    globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
  }

  return globalForPrisma.prisma;
}

export const prisma = getPrismaClient();
