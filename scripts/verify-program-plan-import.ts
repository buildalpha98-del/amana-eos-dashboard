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

  // Library entries that exist before this run; anything newer is ours to remove.
  const libraryBefore = new Set((await prisma.activityTemplate.findMany({ select: { id: true } })).map((t) => t.id));
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

    // Activity Library: added once, never overwritten, never re-created after deletion.
    const { addPlanToLibrary, libraryKey } = await import("../src/lib/program-plan/library");
    const tag = randomUUID().slice(0, 8);
    const libActs = [
      { title: `Check Chickpea Jar ${tag}`, description: "Plant and predict", mtopOutcomes: [4] },
      { title: `Check Kebabs ${tag}`, mtopOutcomes: [3] },
      { title: "Homework Heroes", programmeBrand: "homework_heroes" },
    ];
    const keys = libActs.slice(0, 2).map((x) => libraryKey(x.title));
    let reads = 0;
    const fakeRead = async (_p: unknown, _i: unknown, list: { title: string }[]) => {
      reads++;
      return list.map((x) => ({ title: x.title, resourcesNeeded: "- Cups", howTo: "1. Do it", category: "stem_science" as const }));
    };
    const planFile = { pdf: Buffer.from(""), fileName: "plan.pdf" };
    try {
      assert.equal(await addPlanToLibrary(libActs, planFile, null, fakeRead), 2, "routine left out");
      const lib = await prisma.activityTemplate.findMany({ where: { sourceKey: { in: keys } } });
      assert.equal(lib.length, 2);
      assert.deepEqual(lib.find((t) => t.title.startsWith("Check Chickpea"))!.mtopOutcomes, [4]);
      assert.match(lib[0].howTo ?? "", /Drafted from the centre's monthly program plan/);
      await prisma.activityTemplate.update({ where: { id: lib[0].id }, data: { title: "Edited by staff" } });
      await prisma.activityTemplate.update({ where: { id: lib[1].id }, data: { deleted: true } });
      assert.equal(await addPlanToLibrary(libActs, planFile, null, fakeRead), 0);
      assert.equal(reads, 1, "nothing missing, so no second Claude call");
      const after = await prisma.activityTemplate.findMany({ where: { sourceKey: { in: keys } } });
      assert.equal(after.length, 2);
      assert(after.some((t) => t.title === "Edited by staff"), "staff edit kept");
      assert(after.some((t) => t.deleted), "deleted stays deleted");
    } finally {
      await prisma.activityTemplate.deleteMany({ where: { sourceKey: { in: keys } } });
    }

    // Shared library sweep: a coordinator's typed-in activity reaches the
    // library; a later plan read fills its empty details; staff edits stay.
    const { sweepActivitiesIntoLibrary } = await import("../src/lib/program-plan/library");
    const sweepTag = randomUUID().slice(0, 8);
    const typed = `Coordinator Kite Making ${sweepTag}`;
    const edited = `Coordinator Clay Pots ${sweepTag}`;
    for (const [title, startTime] of [[typed, "15:00"], [edited, "15:05"]] as const) {
      await prisma.programActivity.create({
        data: { serviceId: service.id, weekStart, day: "monday", startTime, endTime: "15:45", title, mtopOutcomes: [4] },
      });
    }
    const sweepKeys = [typed, edited].map((t) => libraryKey(t));
    try {
      assert((await sweepActivitiesIntoLibrary()) >= 2, "typed activities swept in");
      let swept = await prisma.activityTemplate.findMany({ where: { sourceKey: { in: sweepKeys } } });
      assert.equal(swept.length, 2);
      assert(swept.every((t) => t.source === "program" && t.howTo === null && t.durationMinutes != null));
      assert.equal(await sweepActivitiesIntoLibrary(), 0, "second sweep adds nothing");
      // Staff fill in one entry themselves.
      await prisma.activityTemplate.updateMany({ where: { sourceKey: sweepKeys[1] }, data: { howTo: "Staff's own steps" } });
      // The same two activities now appear in a plan: only the untouched one is filled.
      await addPlanToLibrary([{ title: typed }, { title: edited }], planFile, null, fakeRead);
      swept = await prisma.activityTemplate.findMany({ where: { sourceKey: { in: sweepKeys } } });
      const kite = swept.find((t) => t.sourceKey === sweepKeys[0])!;
      const clay = swept.find((t) => t.sourceKey === sweepKeys[1])!;
      assert.match(kite.howTo ?? "", /1\. Do it/, "bare entry filled from the plan");
      assert.equal(kite.resourcesNeeded, "- Cups");
      assert.equal(clay.howTo, "Staff's own steps", "staff-written how-to never overwritten");

      // Auto-fill: Claude (faked) drafts what's missing; staff writing stays.
      const { enrichLibraryEntries } = await import("../src/lib/program-plan/library");
      const third = `Coordinator Balloon Rockets ${sweepTag}`;
      await prisma.programActivity.create({
        data: { serviceId: service.id, weekStart, day: "tuesday", startTime: "15:00", endTime: "16:30", title: third, description: "Race balloons along a string" },
      });
      sweepKeys.push(libraryKey(third));
      await sweepActivitiesIntoLibrary();
      const rocket0 = await prisma.activityTemplate.findUnique({ where: { sourceKey: libraryKey(third) } });
      assert.equal(rocket0!.durationMinutes, 60, "90-minute slot capped at an hour");
      const fakeEnrich = async (list: { id: string; title: string }[]) =>
        list.map((x) => ({
          id: x.id,
          howTo: "1. Thread the string",
          resourcesNeeded: "- Balloons\n- String",
          category: "stem_science" as const,
          mtopOutcomes: [4],
          durationMinutes: 90,
        }));
      await prisma.activityTemplate.updateMany({ where: { sourceKey: libraryKey(third) }, data: { mtopOutcomes: [2] } });
      assert((await enrichLibraryEntries({ enrich: fakeEnrich, limit: 500 })) >= 1);
      const rocket = await prisma.activityTemplate.findUnique({ where: { sourceKey: libraryKey(third) } });
      assert.match(rocket!.howTo ?? "", /Drafted automatically/);
      assert.equal(rocket!.category, "stem_science", "category chosen instead of other");
      assert.deepEqual(rocket!.mtopOutcomes, [2], "existing outcomes kept");
      assert.equal(rocket!.durationMinutes, 60);
      assert(rocket!.enrichedAt, "marked done");
      const clay2 = await prisma.activityTemplate.findUnique({ where: { sourceKey: sweepKeys[1] } });
      assert.equal(clay2!.howTo, "Staff's own steps", "auto-fill never overwrites staff writing");
      assert.equal(await enrichLibraryEntries({ enrich: fakeEnrich, limit: 500 }), 0, "nothing left to fill");
    } finally {
      await prisma.activityTemplate.deleteMany({ where: { sourceKey: { in: sweepKeys } } });
    }

    console.log("PASS: plan imported; closed day skipped; edits and own rows kept; re-sync idempotent; menu file wins with allergens; library add-only; shared-library sweep; auto-fill");
  } finally {
    // The library sweep picks up this synthetic centre's activities too.
    await prisma.activityTemplate.deleteMany({ where: { id: { notIn: [...libraryBefore] } } });
    await prisma.service.delete({ where: { id: service.id } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
