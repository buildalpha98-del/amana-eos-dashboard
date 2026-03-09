import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const schoolHolidays2026 = [
  // ── NSW 2026 ──
  { title: "NSW Term 1 → 2 Holidays", date: "2026-04-11", endDate: "2026-04-27", type: "school_holiday", details: JSON.stringify({ state: "NSW", term: "T1-T2", year: 2026 }) },
  { title: "NSW Term 2 → 3 Holidays", date: "2026-07-04", endDate: "2026-07-19", type: "school_holiday", details: JSON.stringify({ state: "NSW", term: "T2-T3", year: 2026 }) },
  { title: "NSW Term 3 → 4 Holidays", date: "2026-09-19", endDate: "2026-10-05", type: "school_holiday", details: JSON.stringify({ state: "NSW", term: "T3-T4", year: 2026 }) },
  { title: "NSW Summer Holidays", date: "2026-12-19", endDate: "2027-01-27", type: "school_holiday", details: JSON.stringify({ state: "NSW", term: "summer", year: 2026 }) },

  // ── VIC 2026 ──
  { title: "VIC Term 1 → 2 Holidays", date: "2026-04-04", endDate: "2026-04-19", type: "school_holiday", details: JSON.stringify({ state: "VIC", term: "T1-T2", year: 2026 }) },
  { title: "VIC Term 2 → 3 Holidays", date: "2026-06-27", endDate: "2026-07-12", type: "school_holiday", details: JSON.stringify({ state: "VIC", term: "T2-T3", year: 2026 }) },
  { title: "VIC Term 3 → 4 Holidays", date: "2026-09-19", endDate: "2026-10-04", type: "school_holiday", details: JSON.stringify({ state: "VIC", term: "T3-T4", year: 2026 }) },
  { title: "VIC Summer Holidays", date: "2026-12-19", endDate: "2027-01-28", type: "school_holiday", details: JSON.stringify({ state: "VIC", term: "summer", year: 2026 }) },

  // ── Term start dates (for term week calculation) ──
  { title: "NSW Term 1 Start", date: "2026-01-28", type: "term_start", details: JSON.stringify({ state: "NSW", term: 1, year: 2026 }) },
  { title: "NSW Term 2 Start", date: "2026-04-28", type: "term_start", details: JSON.stringify({ state: "NSW", term: 2, year: 2026 }) },
  { title: "NSW Term 3 Start", date: "2026-07-20", type: "term_start", details: JSON.stringify({ state: "NSW", term: 3, year: 2026 }) },
  { title: "NSW Term 4 Start", date: "2026-10-06", type: "term_start", details: JSON.stringify({ state: "NSW", term: 4, year: 2026 }) },
  { title: "VIC Term 1 Start", date: "2026-01-28", type: "term_start", details: JSON.stringify({ state: "VIC", term: 1, year: 2026 }) },
  { title: "VIC Term 2 Start", date: "2026-04-20", type: "term_start", details: JSON.stringify({ state: "VIC", term: 2, year: 2026 }) },
  { title: "VIC Term 3 Start", date: "2026-07-13", type: "term_start", details: JSON.stringify({ state: "VIC", term: 3, year: 2026 }) },
  { title: "VIC Term 4 Start", date: "2026-10-05", type: "term_start", details: JSON.stringify({ state: "VIC", term: 4, year: 2026 }) },
];

async function main() {
  console.log("Seeding school holidays and term dates...");

  for (const event of schoolHolidays2026) {
    // Upsert to avoid duplicates on re-run
    const existing = await prisma.calendarEvent.findFirst({
      where: { title: event.title, date: new Date(event.date) },
    });

    if (existing) {
      console.log(`  Skipping (exists): ${event.title}`);
      continue;
    }

    await prisma.calendarEvent.create({
      data: {
        title: event.title,
        date: new Date(event.date),
        endDate: "endDate" in event && event.endDate ? new Date(event.endDate) : null,
        type: event.type,
        details: event.details,
        centreId: null, // applies to all centres
      },
    });
    console.log(`  Created: ${event.title}`);
  }

  console.log("Done!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
