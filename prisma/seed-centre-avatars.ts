/**
 * Sprint 3 seed — create one CentreAvatar per Service and seed Section 1
 * starter data (numbers, parentDrivers, programmeFocus) where the service
 * name matches the Doc 5 Appendix.
 *
 * Idempotent — safe to run multiple times.
 *
 * Usage:
 *   npx tsx prisma/seed-centre-avatars.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { CENTRE_AVATAR_STARTER_DATA } from "../src/lib/seed/centre-avatar-starter-data";

const prisma = new PrismaClient();

async function main() {
  const services = await prisma.service.findMany({
    orderBy: [{ state: "asc" }, { name: "asc" }],
    select: { id: true, name: true, state: true },
  });

  let created = 0;
  let seeded = 0;
  let skipped = 0;

  for (const svc of services) {
    const existing = await prisma.centreAvatar.findUnique({
      where: { serviceId: svc.id },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const starter = CENTRE_AVATAR_STARTER_DATA[svc.name];

    await prisma.centreAvatar.create({
      data: {
        serviceId: svc.id,
        snapshot: starter
          ? (starter as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        lastUpdatedAt: new Date(),
      },
    });
    created += 1;
    if (starter) seeded += 1;

    console.log(
      `${starter ? "[seeded] " : "[empty]  "}${svc.state}  ${svc.name}`,
    );
  }

  console.log(
    `\nSummary: created ${created}, of which ${seeded} seeded with starter data. Skipped ${skipped} existing.`,
  );
  const total = await prisma.centreAvatar.count();
  console.log(`Total CentreAvatar rows now: ${total}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
