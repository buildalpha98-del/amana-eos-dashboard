/** Local PostgreSQL check: npx tsx scripts/verify-program-plan-import.ts
 *
 * Writes week 1 of MFIS Greenacre's real Term 4 plan (as the extractor
 * returns it) into a synthetic centre, then checks a re-sync replaces only
 * untouched imported rows and never a coordinator's edit. Removes the
 * synthetic centre (and with it every row it owns) at the end.
 */
import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

async function main() {
  loadEnvConfig(process.cwd());
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert(
    ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/amana_local",
    "This check requires the local amana_local database.",
  );
  const { prisma } = await import("../src/lib/prisma");
  const { writePlanWeek, writeMenuWeek } = await import("../src/lib/program-plan/sync");
  type Week = Parameters<typeof writePlanWeek>[2];

  const week: Week = {
    weekStart: "2026-10-12",
    title: "Welcome Back: My Story, Our Place",
    question: "What makes Amana Afternoons feel like our place?",
    closedDays: ["monday"],
    activities: [
      { day: "monday", startTime: "07:00", endTime: "08:15", title: "Should be dropped — closed" },
      { day: "tuesday", startTime: "07:00", endTime: "08:15", title: "Welcome Back Drawings", description: "Draw 'my holidays in one picture' and share it with a friend at the table." },
      { day: "tuesday", startTime: "15:45", endTime: "16:15", title: "Homework Heroes", programmeBrand: "homework_heroes" },
      { day: "tuesday", startTime: "16:15", endTime: "17:00", title: "Imagination Station: My Story, Our Quilt", programmeBrand: "imagination_station", mtopOutcomes: [1, 2, 5] },
      { day: "wednesday", startTime: "15:45", endTime: "16:30", title: "Fuel Up with Amana: Friendship Fruit Kebabs", programmeBrand: "fuel_up" },
      // Same day and start time as the line above — folded, not lost.
      { day: "wednesday", startTime: "15:45", endTime: "16:15", title: "Children's Meeting", description: "Our Term 4 Wish List" },
      { day: "thursday", startTime: "16:00", endTime: "17:00", title: "Iqra Circle: Al-Fatiha", programmeBrand: "iqra_circle" },
    ],
    meals: [
      { day: "monday", slot: "breakfast", description: "Should be dropped — closed" },
      { day: "tuesday", slot: "breakfast", description: "Weet-Bix with milk, tinned fruit in juice" },
      { day: "tuesday", slot: "afternoon_tea", description: "Build-your-own wraps and orange wedges" },
      { day: "friday", slot: "afternoon_tea", description: "Za'atar and cheese manoush for World Food Day, with cucumber and tomato" },
    ],
  };

  const service = await prisma.service.create({
    data: { name: `Program plan check ${randomUUID()}`, code: `PPC-${randomUUID().slice(0, 8)}` },
  });
  const weekStart = new Date("2026-10-12T00:00:00Z");
  const acts = () => prisma.programActivity.findMany({ where: { serviceId: service.id, weekStart } });
  const items = async () =>
    (await prisma.menuWeek.findUnique({
      where: { serviceId_weekStart: { serviceId: service.id, weekStart } },
      include: { items: { orderBy: { slot: "asc" } } },
    }))?.items ?? [];
  try {
    await prisma.$transaction((tx) => writePlanWeek(tx, service.id, week));
    let a = await acts();
    assert.equal(a.length, 5, "closed Monday dropped, clash folded");
    assert(a.every((r) => r.source === "sharepoint"));
    const wed = a.find((r) => r.day === "wednesday")!;
    assert.match(wed.description ?? "", /Also at 15:45: Children's Meeting/);
    let m = await items();
    assert.equal(m.length, 3);
    assert.equal(m[0].slot, "breakfast", "breakfast sorts first");

    // A coordinator edits one activity and one meal, and adds their own.
    const iqra = a.find((r) => r.programmeBrand === "iqra_circle")!;
    await prisma.programActivity.update({ where: { id: iqra.id }, data: { title: "Iqra Circle: Al-Fatiha (with Br Omar)", source: null } });
    await prisma.programActivity.create({ data: { serviceId: service.id, weekStart, day: "friday", startTime: "16:00", endTime: "17:00", title: "Coordinator's own" } });
    const wraps = m.find((i) => i.slot === "afternoon_tea" && i.day === "tuesday")!;
    await prisma.menuItem.update({ where: { id: wraps.id }, data: { description: "Wraps — swapped to pita", source: null } });

    // SharePoint plan updated: a new Thursday time and a changed afternoon tea.
    const updated: Week = {
      ...week,
      activities: [
        ...week.activities.filter((x) => x.programmeBrand !== "homework_heroes"),
        { day: "friday", startTime: "16:00", endTime: "16:45", title: "Imported clash with coordinator's own" },
      ],
      meals: week.meals.map((x) => (x.day === "tuesday" && x.slot === "afternoon_tea" ? { ...x, description: "Plan's new wrap" } : x)),
    };
    await prisma.$transaction((tx) => writePlanWeek(tx, service.id, updated));
    a = await acts();
    assert(!a.some((r) => r.programmeBrand === "homework_heroes"), "removed from the plan → removed");
    assert(a.some((r) => r.title === "Iqra Circle: Al-Fatiha (with Br Omar)"), "edit kept");
    assert.equal(a.filter((r) => r.day === "thursday" && r.startTime === "16:00").length, 1, "no duplicate of the edited row");
    assert.equal(a.find((r) => r.day === "friday" && r.startTime === "16:00")!.title, "Coordinator's own", "never overwrites a coordinator's slot");
    m = await items();
    assert.equal(m.find((i) => i.day === "tuesday" && i.slot === "afternoon_tea")!.description, "Wraps — swapped to pita", "meal edit kept");

    // Running the same plan twice changes nothing.
    const before = JSON.stringify((await acts()).map((r) => [r.day, r.startTime, r.title]).sort());
    await prisma.$transaction((tx) => writePlanWeek(tx, service.id, updated));
    assert.equal(JSON.stringify((await acts()).map((r) => [r.day, r.startTime, r.title]).sort()), before);

    // A centre with a menu file: the menu's meals and allergens win, and the
    // plan (synced with meals: false) no longer touches the menu.
    await prisma.$transaction((tx) =>
      writeMenuWeek(tx, service.id, {
        weekStart: "2026-10-12",
        closedDays: ["monday"],
        meals: [
          { day: "tuesday", slot: "breakfast", description: "Toasted English muffin with Vegemite; apple slices", allergens: ["gluten", "soy"] },
          { day: "tuesday", slot: "late_snack", description: "Fruit", allergens: [] },
        ],
      }),
    );
    await prisma.$transaction((tx) => writePlanWeek(tx, service.id, updated, { meals: false }));
    m = await items();
    const muffin = m.find((i) => i.day === "tuesday" && i.slot === "breakfast")!;
    assert.deepEqual(muffin.allergens, ["gluten", "soy"], "allergens from the menu file");
    assert(m.some((i) => i.slot === "late_snack"), "late snack imported");
    assert.equal(m.find((i) => i.day === "tuesday" && i.slot === "afternoon_tea")!.description, "Wraps — swapped to pita", "edit still kept");
    assert(!m.some((i) => i.description === "Za'atar and cheese manoush for World Food Day, with cucumber and tomato"), "plan food lines replaced by the menu file");

    console.log("PASS: plan imported; closed day skipped; edits and own rows kept; re-sync idempotent; menu file wins with allergens");
  } finally {
    await prisma.service.delete({ where: { id: service.id } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
