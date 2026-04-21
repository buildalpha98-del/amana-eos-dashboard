#!/usr/bin/env tsx
/**
 * One-shot: backfill RosterShift.userId by exact match on staffName → User.name.
 *
 * Case-sensitive pass first; case-insensitive fallback for rows still unmatched.
 * Ambiguous matches (>1 user) leave userId=null and log to stdout.
 *
 * Usage (run against live DB): npx tsx scripts/one-shots/backfill-roster-userid.ts
 */
import { prisma } from "@/lib/prisma";

async function main() {
  console.log("Starting RosterShift.userId backfill...");

  const unlinkedShifts = await prisma.rosterShift.findMany({
    where: { userId: null },
    select: { id: true, staffName: true },
  });
  console.log(`Found ${unlinkedShifts.length} shifts without userId.`);

  const distinctNames = Array.from(new Set(unlinkedShifts.map((s) => s.staffName.trim())));
  console.log(`${distinctNames.length} distinct staffName values.`);

  let matched = 0;
  let multiMatch = 0;
  let unmatched = 0;

  for (const name of distinctNames) {
    // Case-sensitive first
    let users = await prisma.user.findMany({
      where: { name, active: true },
      select: { id: true, name: true },
    });

    // Case-insensitive fallback
    if (users.length === 0) {
      users = await prisma.user.findMany({
        where: { name: { equals: name, mode: "insensitive" }, active: true },
        select: { id: true, name: true },
      });
    }

    if (users.length === 1) {
      const updated = await prisma.rosterShift.updateMany({
        where: { staffName: name, userId: null },
        data: { userId: users[0].id },
      });
      matched += updated.count;
      console.log(`  Matched: "${name}" → ${users[0].id} (${updated.count} shifts)`);
    } else if (users.length > 1) {
      multiMatch++;
      console.log(`  Ambiguous (${users.length} matches): "${name}" — left unmatched`);
    } else {
      unmatched++;
      console.log(`  Unmatched: "${name}"`);
    }
  }

  console.log();
  console.log("Summary:");
  console.log(`  Shifts with userId set: ${matched}`);
  console.log(`  Ambiguous names (>1 user): ${multiMatch}`);
  console.log(`  Unmatched names (0 users): ${unmatched}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
