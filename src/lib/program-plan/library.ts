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
import { z } from "zod";
import { generateStructured } from "@/lib/ai-provider";
import { ACTIVITY_CATEGORIES, extractLibraryDetails } from "./extract";

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
            enrichedAt: new Date(),
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
        durationMinutes: capMinutes(d.durationMinutes),
        ageGroup: "5–12",
        mtopOutcomes: c.mtopOutcomes,
        source: "sharepoint",
        sourceKey: c.key,
        enrichedAt: new Date(),
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

/** Daniel, 2026-10-12: library activities run at most an hour. */
export const MAX_ACTIVITY_MINUTES = 60;
export function capMinutes(m: number | null | undefined): number | null {
  if (!m || m <= 0) return null;
  return Math.min(Math.round(m), MAX_ACTIVITY_MINUTES);
}

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
        durationMinutes: capMinutes(length > 0 ? length : null),
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

// ── Fill in what a centre's week doesn't say ────────────────────────────
// An activity typed into a week has a name and maybe a sentence. Claude
// drafts the rest from those — how to run it, resources, the best category
// and the MTOP outcomes — for entries the sweep added, filling ONLY empty
// fields (category only while it's "other"), labelled as drafted.

const enrichSchema = z.object({
  activities: z
    .array(
      z.object({
        id: z.string(),
        howTo: z.string().min(1).max(5000),
        resourcesNeeded: z.string().max(2000),
        category: z.enum(ACTIVITY_CATEGORIES),
        mtopOutcomes: z.array(z.number().int().min(1).max(5)).min(1).max(5),
        durationMinutes: z.number().int().min(5).max(240).optional(),
      }),
    )
    .max(40),
});

const ENRICH_SYSTEM = `You complete entries in Amana OSHC's Activity Library — reusable activities for Outside School Hours Care (school-age children, 5 to 12, in Australia) that educators at any centre can pick up and run.

For each activity (id, title, description) return:
- id: exactly as given.
- howTo: 4 to 8 short numbered steps an educator can follow, based on what the title and description say children do. Include any safety point that matters (handwashing and an allergy check before food, space and cones for active games, an educator at the table for cooking, sun safety outdoors). Warm, plain Australian English.
- resourcesNeeded: the materials, one per line starting "- ". Only what the activity obviously needs; never specialist equipment it doesn't mention.
- category: the best fit of physical_play (sport, games, movement), creative_arts (art, craft, drawing, making), music_movement (music, dance), literacy (reading, writing, stories), numeracy (maths, counting, measuring), nature_outdoors (nature, gardening, outdoor exploring), cooking_nutrition (cooking, food, healthy eating), social_emotional (feelings, friendship, wellbeing, group agreements, reflection), quiet_time (calm, mindfulness, rest), free_play, quran_iqra (Quran, Iqra, Islamic learning), homework_help, stem_science (science, experiments, building, engineering, technology), or other ONLY when nothing fits.
- mtopOutcomes: the My Time, Our Place outcomes the activity mainly supports (1 to 3 of them): 1 children have a strong sense of identity; 2 children are connected with and contribute to their world; 3 children have a strong sense of wellbeing; 4 children are confident and involved learners; 5 children are effective communicators.
- durationMinutes: a realistic length, at most 60.`;

const ENRICHED_NOTE = "\n\n(Drafted automatically from the activity name and description — check and adjust before running.)";

type Enricher = (list: { id: string; title: string; description: string | null }[]) => Promise<z.infer<typeof enrichSchema>["activities"]>;

const enrichWithClaude: Enricher = async (list) => {
  const { data } = await generateStructured({
    system: ENRICH_SYSTEM,
    prompt: `Complete these activities:\n${JSON.stringify(list)}`,
    schema: enrichSchema,
    maxTokens: 12_000,
    temperature: 0.3,
  });
  return data.activities;
};

/**
 * Fill entries the sweep added (or any auto-added entry not yet done), a
 * batch at a time. Returns how many were filled. Never overwrites: each
 * field is written only where it is still empty.
 */
export async function enrichLibraryEntries(
  opts: { limit?: number; deadline?: number; enrich?: Enricher } = {},
): Promise<number> {
  const enrich = opts.enrich ?? enrichWithClaude;
  const todo = await prisma.activityTemplate.findMany({
    where: { deleted: false, enrichedAt: null, source: { in: [SWEPT, "sharepoint"] } },
    select: { id: true, title: true, description: true, howTo: true, resourcesNeeded: true, category: true, mtopOutcomes: true, durationMinutes: true },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 40,
  });
  let filled = 0;
  for (let i = 0; i < todo.length; i += 20) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    const batch = todo.slice(i, i + 20);
    const out = await enrich(batch.map((t) => ({ id: t.id, title: t.title, description: t.description })));
    const byId = new Map(out.map((o) => [o.id, o]));
    for (const t of batch) {
      const o = byId.get(t.id);
      if (!o) continue; // not answered — tried again next time
      await prisma.activityTemplate.update({
        where: { id: t.id },
        data: {
          howTo: t.howTo ?? o.howTo.trim() + ENRICHED_NOTE,
          resourcesNeeded: t.resourcesNeeded ?? (o.resourcesNeeded.trim() || null),
          category: t.category === "other" ? o.category : t.category,
          mtopOutcomes: t.mtopOutcomes.length ? t.mtopOutcomes : [...new Set(o.mtopOutcomes)].sort(),
          durationMinutes: capMinutes(t.durationMinutes ?? o.durationMinutes ?? null),
          enrichedAt: new Date(),
        },
      });
      filled++;
    }
  }
  if (filled) logger.info("Library entries filled in automatically", { filled });
  return filled;
}

let enriching = false;
/** Fire-and-forget after a library view: one batch, never throws, never overlaps. */
export async function enrichLibraryEntriesSoon(): Promise<void> {
  if (enriching || !process.env.ANTHROPIC_API_KEY) return;
  enriching = true;
  try {
    await enrichLibraryEntries({ limit: 20 });
  } catch (err) {
    logger.warn("Library auto-fill failed", { err });
  } finally {
    enriching = false;
  }
}
