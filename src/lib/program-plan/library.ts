/**
 * Program-plan activities → the Activity Library (Daniel, 2026-10-12).
 *
 * Every activity a centre runs from its monthly plan becomes a reusable
 * library entry — name, resources needed, how to run it, MTOP outcomes — so
 * staff can later pick it for their own week ("Library" on Program).
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
    select: { sourceKey: true },
  });
  const have = new Set(existing.map((e) => e.sourceKey));
  const missing = candidates.filter((c) => !have.has(c.key));
  let added = 0;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const details = await read(planFile, insert, batch);
    const byKey = new Map(details.map((d) => [libraryKey(d.title), d]));
    const rows: Prisma.ActivityTemplateCreateManyInput[] = [];
    for (const c of batch) {
      const d = byKey.get(c.key);
      if (!d) continue; // not answered — tried again next sync
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
