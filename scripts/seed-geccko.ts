import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seed GECCKO compliance entries for all active staff.
 * Creates a ComplianceCertificate of type "geccko" for each active user
 * assigned to a service, with a 12-month validity window.
 */
async function main() {
  const activeStaff = await prisma.user.findMany({
    where: {
      active: true,
      serviceId: { not: null },
    },
    select: {
      id: true,
      name: true,
      serviceId: true,
    },
  });

  console.log(`Found ${activeStaff.length} active staff with service assignments`);

  const now = new Date();
  const issueDate = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
  const expiryDate = new Date(issueDate);
  expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 12-month validity

  let created = 0;
  let skipped = 0;

  for (const staff of activeStaff) {
    // Check if a geccko cert already exists for this user
    const existing = await prisma.complianceCertificate.findFirst({
      where: {
        userId: staff.id,
        type: "geccko",
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.complianceCertificate.create({
      data: {
        serviceId: staff.serviceId!,
        userId: staff.id,
        type: "geccko",
        label: `GECCKO – ${staff.name}`,
        issueDate,
        expiryDate,
        alertDays: 30,
        notes: "Auto-seeded GECCKO entry. Update with actual completion date.",
      },
    });
    created++;
  }

  console.log(`GECCKO seed complete: ${created} created, ${skipped} already existed`);
}

main()
  .catch((e) => {
    console.error("GECCKO seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
