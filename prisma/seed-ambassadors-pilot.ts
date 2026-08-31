import type { PrismaClient } from "@prisma/client";

/**
 * Seeds the Amana Ambassadors PILOT (the incentive tracker) — distinct from
 * seed-ambassadors.ts, which seeds the LMS course of the same name.
 *
 * Pilot window 17 Aug – 11 Sep 2026 at 4 centres. Created as DRAFT: Jayden
 * activates it from the dashboard once ref codes are distributed, so a
 * deploy never silently starts (or restarts) the pilot.
 *
 * Idempotency rules (seed runs on EVERY deploy):
 * - Pilot matched by name; never created twice, and an existing pilot's
 *   status/dates are never touched (admins own them after first deploy).
 * - Centres are create-if-missing only — an admin-edited target or bonus
 *   amount must survive redeploys.
 */

const PILOT_NAME = "Amana Ambassadors Pilot — Term 3 2026";

const CENTRES: { code: string; target: number }[] = [
  { code: "MFIS-GA", target: 8 },
  { code: "MFIS-BH", target: 5 },
  { code: "MIN-DOV", target: 6 },
  { code: "MIN-SPR", target: 6 },
];

export async function seedAmbassadorsPilot(prisma: PrismaClient): Promise<void> {
  console.log("Seeding Amana Ambassadors pilot...");

  let pilot = await prisma.ambassadorPilot.findFirst({
    where: { name: PILOT_NAME },
    select: { id: true },
  });
  if (!pilot) {
    pilot = await prisma.ambassadorPilot.create({
      data: {
        name: PILOT_NAME,
        startDate: new Date("2026-08-17"),
        endDate: new Date("2026-09-11"),
        status: "draft",
      },
      select: { id: true },
    });
  }

  for (const centre of CENTRES) {
    const service = await prisma.service.findUnique({
      where: { code: centre.code },
      select: { id: true },
    });
    if (!service) {
      console.warn(`Ambassadors pilot: service ${centre.code} not found — skipping.`);
      continue;
    }
    const existing = await prisma.ambassadorPilotCentre.findUnique({
      where: { pilotId_serviceId: { pilotId: pilot.id, serviceId: service.id } },
      select: { id: true },
    });
    if (!existing) {
      await prisma.ambassadorPilotCentre.create({
        data: {
          pilotId: pilot.id,
          serviceId: service.id,
          targetQualifiedEnrolments: centre.target,
          teamBonusAmount: 200,
        },
      });
    }
  }

  console.log("Amana Ambassadors pilot seeded (draft).");
}
