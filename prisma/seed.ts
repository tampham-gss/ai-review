import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin" },
    update: {
      role: "admin",
      isDisabled: false,
      passwordHash,
      name: "Admin",
    },
    create: {
      email: "admin",
      name: "Admin",
      role: "admin",
      passwordHash,
      isDisabled: false,
    },
  });

  await prisma.user.updateMany({
    where: { email: { not: "admin" } },
    data: { role: "user" },
  });

  await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      registrationOpen: true,
      maintenanceMode: false,
      retentionDays: 90,
    },
  });

  console.log(`Admin ready: email=admin password=123 id=${admin.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
