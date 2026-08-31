#!/usr/bin/env tsx
/**
 * One-shot: seed the "OSHC Educator — Casual" contract template.
 *
 * Rebuilds the template Daniel lost (matching the Employment Hero
 * source contract dated 2026-04-17). Payload lives in
 * src/lib/contract-templates/casual-educator-preset.ts so the same
 * definition is used by the UI-triggerable seed endpoint too.
 *
 * Idempotent: skips if a template with this name already exists.
 *
 * Usage (against prod):
 *   npx tsx scripts/one-shots/seed-casual-educator-template.ts
 *
 * Requires: DATABASE_URL pointing at prod, and one active owner user
 * in the DB so we can attribute createdById.
 */
import { prisma } from "@/lib/prisma";
import {
  CASUAL_EDUCATOR_TEMPLATE_NAME,
  CASUAL_EDUCATOR_TEMPLATE_DESCRIPTION,
  CASUAL_EDUCATOR_CONTENT_JSON,
  CASUAL_EDUCATOR_MANUAL_FIELDS,
} from "@/lib/contract-templates/casual-educator-preset";

async function main() {
  const existing = await prisma.contractTemplate.findFirst({
    where: { name: CASUAL_EDUCATOR_TEMPLATE_NAME },
  });
  if (existing) {
    console.log(
      `Template "${CASUAL_EDUCATOR_TEMPLATE_NAME}" already exists (id=${existing.id}). Nothing to do.`,
    );
    return;
  }

  const creator = await prisma.user.findFirst({
    where: { role: "owner", active: true },
    select: { id: true, name: true },
  });
  if (!creator) {
    throw new Error(
      "No active owner user found — cannot attribute createdById.",
    );
  }

  const created = await prisma.contractTemplate.create({
    data: {
      name: CASUAL_EDUCATOR_TEMPLATE_NAME,
      description: CASUAL_EDUCATOR_TEMPLATE_DESCRIPTION,
      contentJson: CASUAL_EDUCATOR_CONTENT_JSON as never,
      manualFields: CASUAL_EDUCATOR_MANUAL_FIELDS as never,
      createdById: creator.id,
    },
  });

  console.log(
    `Created template "${CASUAL_EDUCATOR_TEMPLATE_NAME}" (id=${created.id})`,
  );
  console.log(`Attributed to owner: ${creator.name}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
