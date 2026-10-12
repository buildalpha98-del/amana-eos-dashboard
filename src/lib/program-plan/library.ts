/**
 * Program-plan activities → the Activity Library (Daniel, 2026-10-12).
 *
 * Every activity a centre runs from its monthly plan becomes a reusable
 * library entry — name, resources needed, how to run it, MTOP outcomes — so
 * staff can later pick it for their own week ("Library" on Program).
 *
 * Since 2026-10-12 (Daniel): EVERY activity on any centre's Activities tab
 * goes in — typed by a coordinator, imported, from cowork or from a plan —
 * because the library is one shared library for every centre. Activities
 * without a plan behind them arrive bare (name, description, outcomes);
 * when the same activity later turns up in a plan, the plan read fills in
 * resources and how-to for that still-untouched entry.
 *
 * Rules:
 * - ADD only. An entry staff have edited, or deleted, is never touched or
 *   re-created: `sourceKey` (the normalised title) is unique and checked
 *   including deleted rows.
 * - The same activity run at eleven centres, or in two months, is ONE entry.
 * - Daily routines (Homework Heroes, free play, afternoon tea) aren't
 *   activities to reuse, so they're left out.
 * - The how-to is drafted by Claude from the plan and the Centre Insert's
 *   materials list, and says so.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { extractLibraryDetails } from "./extract";

/** An activity as the plan (or a saved program row) describes it. */
export interface PlanActivity {
  title: string;
  description?: string | null;
  programmeBrand?: string | null;
  mtopOutcomes?: number[] | null;
}

const ROUTINE = /^(homework heroes|free play|afternoon tea|late snack|pack.?up|roll call)\b/i;
const DRAFTED_NOTE = "\n\n(Drafted from the centre's monthly program plan — check and adjust before running.)";

/** "Imagination Station: Grow a Chickpea in a Jar!" → "imagination station grow a chickpea in a jar" */
export function libraryKey(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export interface LibraryCandidate {
  key: string;
  title: string;
  description: string | null;
  mtopOutcomes: number[];
}

/** One candidate per distinct activity, routines left out. */
export function libraryCandidates(activities: PlanActivity[]): LibraryCandidate[] {
  const byKey = new Map<string, LibraryCandidate>();
  for (const a of activities) {
      if (a.programmeBrand === "homework_heroes" || a.programmeBrand === "free_play") continue;
      if (ROUTINE.test(a.title)) continue;
      const key = libraryKey(a.title);
      if (!key) continue;
      const prev = byKey.get(key);
      const outcomes = new Set([...(prev?.mtopOutcomes ?? []), ...(a.mtopOutcomes ?? [])]);
      byKey.set(key, {
        key,
        title: a.title,
        description: prev?.description ?? a.description ?? null,
        mtopOutcomes: [...outcomes].sort(),
      });
  }
  return [...byKey.values()];
}

/** Batches keep each Claude call small enough to answer well. */
const BATCH = 25;

export async function addPlanToLibrary(
  activities: PlanActivity[],
  planFile: { pdf: Buffer; fileName: string },
  insert: { pdf: Buffer; fileName: string } | null,
  read: typeof extractLibraryDetails = extractLibraryDetails,
): Promise<number> {
  const candidates = libraryCandidates(activities);
  if (candidates.length === 0) return 0;
  const existing = await prisma.activityTemplate.findMany({
    where: { sourceKey: { in: candidates.map((c) => c.key) } }, // deleted rows included on purpose
    select: { id: true, sourceKey: true, source: true, howTo: true, resourcesNeeded: true, deleted: true, mtopOutcomes: true },
  });
  const byExisting = new Map(existing.map((e) => [e.sourceKey, e]));
  // A bare entry the sweep added from a typed-in activity, still untouched:
  // the plan can fill its empty how-to and resources.
  const bare = (e: (typeof existing)[number]) =>
    !e.deleted && e.source === SWEPT && !e.howTo && !e.resourcesNeeded;
  const missing = candidates.filter((c) => {
    const e = byExisting.get(c.key);
    return !e || bare(e);
  });
  let added = 0;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const details = await read(planFile, insert, batch);
    const byKey = new Map(details.map((d) => [libraryKey(d.title), d]));
    const rows: Prisma.ActivityTemplateCreateManyInput[] = [];
    for (const c of batch) {
      const d = byKey.get(c.key);
      if (!d) continue; // not answered — tried again next sync
      const e = byExisting.get(c.key);
      if (e) {
        // Fill only what's empty, and only while nobody has touched it.
        const res = await prisma.activityTemplate.updateMany({
          where: { id: e.id, source: SWEPT, howTo: null, resourcesNeeded: null, deleted: false },
          data: {
            howTo: d.howTo.trim() + DRAFTED_NOTE,
            resourcesNeeded: d.resourcesNeeded.trim() || null,
            category: d.category,
            mtopOutcomes: [...new Set([...e.mtopOutcomes, ...c.mtopOutcomes])].sort(),
            source: "sharepoint",
          },
        });
        added += res.count;
        continue;
      }
      rows.push({
        title: c.title,
        description: c.description,
        howTo: d.howTo.trim() + DRAFTED_NOTE,
        resourcesNeeded: d.resourcesNeeded.trim() || null,
        category: d.category,
        durationMinutes: d.durationMinutes ?? null,
        ageGroup: "5–12",
        mtopOutcomes: c.mtopOutcomes,
        source: "sharepoint",
        sourceKey: c.key,
      });
    }
    if (rows.length) {
      const res = await prisma.activityTemplate.createMany({ data: rows, skipDuplicates: true });
      added += res.count;
    }
  }
  if (added) logger.info("Program plan activities added to the library", { added, file: planFile.fileName });
  return added;
}

// ── Every activity, from every centre ──────────────────────────────────

/** Marks entries the sweep added from saved activities (not yet edited). */
export const SWEPT = "program";

const BRAND_CATEGORY: Record<string, string> = {
  iqra_circle: "quran_iqra",
  imagination_station: "creative_arts",
  little_champions: "physical_play",
  fuel_up: "cooking_nutrition",
};

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Put every activity on any centre's Activities tab into the shared library
 * that isn't there yet — one entry per activity name, add-only (deleted
 * entries stay deleted). Database-only and cheap: runs when someone opens
 * the library and nightly, so a coordinator's new activity reaches every
 * centre without anyone copying it across.
 */
export async function sweepActivitiesIntoLibrary(): Promise<number> {
  const rows = await prisma.programActivity.findMany({
    select: { title: true, description: true, programmeBrand: true, mtopOutcomes: true, startTime: true, endTime: true },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  });
  const candidates = libraryCandidates(rows);
  if (candidates.length === 0) return 0;
  const have = new Set(
    (
      await prisma.activityTemplate.findMany({
        where: { sourceKey: { in: candidates.map((c) => c.key) } },
        select: { sourceKey: true },
      })
    ).map((e) => e.sourceKey),
  );
  // Newest row per activity name supplies the brand and length.
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const k = libraryKey(r.title);
    if (!latest.has(k)) latest.set(k, r);
  }
  const data: Prisma.ActivityTemplateCreateManyInput[] = candidates
    .filter((c) => !have.has(c.key))
    .map((c) => {
      const r = latest.get(c.key);
      const length = r ? minutes(r.endTime) - minutes(r.startTime) : 0;
      return {
        title: c.title,
        description: c.description,
        category: (BRAND_CATEGORY[r?.programmeBrand ?? ""] ?? "other") as Prisma.ActivityTemplateCreateManyInput["category"],
        durationMinutes: length > 0 && length <= 240 ? length : null,
        ageGroup: "5–12",
        mtopOutcomes: c.mtopOutcomes,
        source: SWEPT,
        sourceKey: c.key,
      };
    });
  if (data.length === 0) return 0;
  const res = await prisma.activityTemplate.createMany({ data, skipDuplicates: true });
  if (res.count) logger.info("Activities added to the shared library", { added: res.count });
  return res.count;
}

let lastSweep = 0;
/**
 * A centre just added or changed activities: the next library view sweeps
 * straight away instead of waiting out the throttle. (Per server instance —
 * another instance catches up within its minute.)
 */
export function markLibraryStale() {
  lastSweep = 0;
}
/** At most once a minute per server instance; never throws. */
export async function sweepActivitiesIntoLibrarySoon(): Promise<void> {
  if (Date.now() - lastSweep < 60_000) return;
  lastSweep = Date.now();
  try {
    await sweepActivitiesIntoLibrary();
  } catch (err) {
    logger.warn("Activity library sweep failed", { err });
  }
}
