/**
 * Seed: Jinan as a VendorContact (one-shot).
 *
 * Run via:  `npx tsx prisma/seed-vendor-contacts.ts`
 *
 * Looks up Jinan's User account by name (case-insensitive prefix match)
 * and role IN ('admin', 'head_office', 'owner'). If matched, upserts a
 * VendorContact with her FK + sensible defaults for the brief types she
 * handles. If no match, logs a warning and exits — does NOT fabricate
 * an email or User record.
 */
import { PrismaClient, VendorBriefType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const jinan = await prisma.user.findFirst({
    where: {
      role: { in: ["admin", "head_office", "owner"] },
      name: { startsWith: "Jinan", mode: "insensitive" },
    },
  });

  if (!jinan) {
    console.warn(
      "[seed-vendor-contacts] No User found for Jinan (admin/head_office/owner with name like 'Jinan%'). " +
        "Skipping VendorContact seed. Add her User account first, then re-run.",
    );
    return;
  }

  const contact = await prisma.vendorContact.upsert({
    where: { userId: jinan.id },
    update: {
      name: jinan.name ?? "Jinan",
      email: jinan.email,
      // Don't overwrite existing custom defaults if someone has tuned them.
    },
    create: {
      name: jinan.name ?? "Jinan",
      email: jinan.email,
      company: "Amana OSHC",
      role: "Operations Manager",
      defaultForTypes: [
        VendorBriefType.signage,
        VendorBriefType.print_collateral,
        VendorBriefType.event_supplies,
      ],
      active: true,
      userId: jinan.id,
      notes:
        "Internal Operations Manager. Source of truth for vendor briefs is " +
        "email/Teams; the dashboard is the tracker. SLA: 48h ack, 5 BD quote.",
    },
  });

  console.log(
    `[seed-vendor-contacts] VendorContact upserted for ${contact.name} (id: ${contact.id})`,
  );
}

main()
  .catch((err) => {
    console.error("[seed-vendor-contacts] Failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
