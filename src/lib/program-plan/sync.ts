/**
 * SharePoint → Program and Menu (Daniel, 2026-10-12).
 *
 * Each centre's monthly plan lives in its own SharePoint folder:
 *   <NSW Schools | Melbourne Schools>/Amana OSHC - <Centre>/
 *     QA1 - Educational Program & Practice/Program Plans/*Program_Plan*.pdf
 * Nightly (and on "Sync now") we find the newest plan per centre, skip it if
 * its etag hasn't changed, have Claude read it (extract.ts), and write each
 * week's activities and meals.
 *
 * Coordinator edits always survive: only rows still marked
 * `source: "sharepoint"` (untouched since import) are replaced, and a new row
 * never takes a day/time or day/meal slot a person already filled.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { graphGet, downloadAsPdf, isGraphConfigured, listFolderFiles, type DriveItem } from "@/lib/ms-graph";
import { mergeServiceContent } from "@/lib/service-content-shared";
import { extractProgramPlan, type ProgramPlan, type ProgramPlanWeek } from "./extract";

/** The two document libraries holding a folder per centre. */
const CENTRE_DRIVES = (
  process.env.SHAREPOINT_CENTRE_DRIVE_IDS ||
  [
    "b!anYMlR1iJE6qf8i6xx7oPUyIvXDGtQxOlxrLNjlUnU2PWkyI8dHETKbVp59nKGG8", // NSW Schools
    "b!anYMlR1iJE6qf8i6xx7oPUyIvXDGtQxOlxrLNjlUnU0bEttk687uRJCbgv2V5jxq", // Melbourne Schools
  ].join(",")
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const PLANS_PATH = "QA1 - Educational Program & Practice/Program Plans";
const PLAN_FILE = /program.?plan.*\.pdf$/i;
const SKIP_FOLDER = /archive|old|superseded|previous/i;
/** The newest plans only — older months are history, not something to re-read. */
const FILES_PER_CENTRE = 2;

export const IMPORTED = "sharepoint";

interface CentreFolder {
  driveId: string;
  name: string;
  driveWebUrl: string;
}

/** "Amana OSHC - MFIS BH" / "Amana OSHC MFIS Beaumont Hills" → comparable keys. */
export function centreKeys(name: string): string[] {
  const words = name
    .toLowerCase()
    .replace(/amana\s*oshc/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return [];
  const full = words.join(" ");
  // "mfis beaumont hills" → "mfis bh": the folders abbreviate the suburb.
  const tail = [words[0], words.slice(1).map((w) => w[0]).join("")].filter(Boolean).join(" ");
  return [...new Set([full, tail, words.join("")])];
}

/** Pick the centre's folder: its saved SharePoint link first, then its name. */
export function matchCentreFolder(
  service: { name: string; sharepointUrl: string },
  folders: CentreFolder[],
): CentreFolder | { error: string } {
  if (service.sharepointUrl) {
    let path = "";
    try {
      path = decodeURIComponent(new URL(service.sharepointUrl).pathname);
    } catch {
      /* not a URL — fall through to the name */
    }
    const hit = folders.find((f) => {
      const lib = decodeURIComponent(new URL(f.driveWebUrl).pathname).replace(/\/$/, "");
      return path.startsWith(`${lib}/${f.name}`);
    });
    if (hit) return hit;
  }
  const keys = new Set(centreKeys(service.name));
  const hits = folders.filter((f) => centreKeys(f.name).some((k) => keys.has(k)));
  if (hits.length === 1) return hits[0];
  return {
    error:
      hits.length === 0
        ? `No SharePoint folder matches "${service.name}". Paste the centre's SharePoint folder link in Configure → What families see.`
        : `More than one SharePoint folder matches "${service.name}" (${hits.map((h) => h.name).join(", ")}). Paste the right folder link in Configure → What families see.`,
  };
}

async function listCentreFolders(): Promise<CentreFolder[]> {
  const out: CentreFolder[] = [];
  for (const driveId of CENTRE_DRIVES) {
    const drive = await graphGet<{ webUrl: string }>(`/drives/${driveId}`);
    let next: string | undefined = `/drives/${driveId}/root/children?$top=200`;
    while (next) {
      const page: { value: DriveItem[]; "@odata.nextLink"?: string } = await graphGet(next);
      for (const item of page.value) {
        if (item.folder) out.push({ driveId, name: item.name, driveWebUrl: drive.webUrl });
      }
      next = page["@odata.nextLink"];
    }
  }
  return out;
}

const etagOf = (f: DriveItem) => f.cTag ?? f.eTag ?? f.lastModifiedDateTime;
const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * Write one week. Imported rows that nobody has touched are replaced; rows a
 * coordinator made or edited are kept, and an imported row never takes their
 * slot. Two imported activities can't share a start time on one day (the
 * table's unique key), so a clash folds the second into the first.
 */
export async function writePlanWeek(
  tx: Prisma.TransactionClient,
  serviceId: string,
  w: ProgramPlanWeek,
) {
  const weekStart = dateOnly(w.weekStart);
  const open = (d: string) => !w.closedDays.includes(d as (typeof w.closedDays)[number]);

  await tx.programActivity.deleteMany({ where: { serviceId, weekStart, source: IMPORTED } });
  const kept = await tx.programActivity.findMany({
    where: { serviceId, weekStart },
    select: { day: true, startTime: true },
  });
  const taken = new Set(kept.map((k) => `${k.day}|${k.startTime}`));
  const rows = new Map<string, Prisma.ProgramActivityCreateManyInput>();
  for (const a of w.activities.filter((a) => open(a.day))) {
    const key = `${a.day}|${a.startTime}`;
    if (taken.has(key)) continue;
    const prev = rows.get(key);
    if (prev) {
      prev.description = [prev.description, `Also at ${a.startTime}: ${a.title}${a.description ? ` — ${a.description}` : ""}`]
        .filter(Boolean)
        .join("\n");
      continue;
    }
    rows.set(key, {
      serviceId,
      weekStart,
      day: a.day,
      startTime: a.startTime,
      endTime: a.endTime,
      title: a.title,
      description: a.description ?? null,
      programmeBrand: a.programmeBrand ?? null,
      mtopOutcomes: a.mtopOutcomes ?? [],
      source: IMPORTED,
    });
  }
  if (rows.size) await tx.programActivity.createMany({ data: [...rows.values()], skipDuplicates: true });

  const meals = w.meals.filter((m) => open(m.day));
  if (meals.length === 0) return { activities: rows.size, meals: 0 };
  const menuWeek = await tx.menuWeek.upsert({
    where: { serviceId_weekStart: { serviceId, weekStart } },
    update: {},
    create: { serviceId, weekStart },
  });
  await tx.menuItem.deleteMany({ where: { menuWeekId: menuWeek.id, source: IMPORTED } });
  // skipDuplicates: a meal the coordinator wrote in that slot stays theirs.
  const created = await tx.menuItem.createMany({
    data: meals.map((m) => ({
      menuWeekId: menuWeek.id,
      day: m.day,
      slot: m.slot,
      description: m.description,
      allergens: [],
      source: IMPORTED,
    })),
    skipDuplicates: true,
  });
  return { activities: rows.size, meals: created.count };
}

export interface CentreSyncResult {
  serviceId: string;
  serviceName: string;
  status: "synced" | "unchanged" | "no_plan" | "error";
  message?: string;
  files?: string[];
}

/** Graph's id for any SharePoint link: "u!" + unpadded base64url of the URL. */
export function shareId(url: string) {
  return `u!${Buffer.from(url.trim()).toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-")}`;
}

/** Every file under a folder item, skipping archive-type subfolders. */
async function listItemFiles(driveId: string, itemId: string): Promise<DriveItem[]> {
  const out: DriveItem[] = [];
  const queue = [`/drives/${driveId}/items/${itemId}/children?$top=200`];
  let guard = 0;
  while (queue.length && guard++ < 50) {
    let next: string | undefined = queue.shift();
    while (next) {
      const page: { value: DriveItem[]; "@odata.nextLink"?: string } = await graphGet(next);
      for (const item of page.value) {
        if (item.folder && !SKIP_FOLDER.test(item.name)) queue.push(`/drives/${driveId}/items/${item.id}/children?$top=200`);
        else if (item.file) out.push(item);
      }
      next = page["@odata.nextLink"];
    }
  }
  return out;
}

/**
 * Where this centre's plans are. The folder link saved on the centre
 * (Configure → What families see → "Program plan folder") is exact: every PDF in
 * it counts. Without one, fall back to the centre's "Program Plans" folder
 * found by name, where only *Program_Plan*.pdf files count.
 */
async function locatePlans(
  service: { name: string; content: Prisma.JsonValue },
  folders: CentreFolder[],
): Promise<{ driveId: string; files: DriveItem[] } | { error: string }> {
  const content = mergeServiceContent(service.content);
  const link = content.programPlanFolderUrl.trim();
  if (link) {
    if (!/^https:\/\/[^/]+\.sharepoint\.com\//i.test(link)) {
      return { error: "The program plan folder link isn't a SharePoint link. Copy it again from SharePoint." };
    }
    try {
      const item = await graphGet<DriveItem & { parentReference?: { driveId?: string } }>(
        `/shares/${shareId(link)}/driveItem`,
      );
      const driveId = item.parentReference?.driveId;
      if (!item.folder || !driveId) return { error: "The program plan link points at a file, not a folder." };
      const files = (await listItemFiles(driveId, item.id)).filter((f) => /\.pdf$/i.test(f.name));
      if (files.length === 0) return { error: `No PDF in the program plan folder (${item.name}) yet.` };
      return { driveId, files };
    } catch {
      return { error: "Couldn't open the program plan folder link. Check it's the right folder and copy the link again." };
    }
  }
  const folder = matchCentreFolder({ name: service.name, sharepointUrl: content.sharepointUrl }, folders);
  if ("error" in folder) {
    return { error: `${folder.error.replace(/ Paste.*$/, "")} Add this centre's program plan folder link in Configure → What families see.` };
  }
  try {
    const files = (await listFolderFiles(folder.driveId, `${folder.name}/${PLANS_PATH}`, (n) => SKIP_FOLDER.test(n)))
      .filter((f) => PLAN_FILE.test(f.name));
    if (files.length === 0) return { error: `No program plan PDF in ${folder.name}/${PLANS_PATH}.` };
    return { driveId: folder.driveId, files };
  } catch {
    return { error: `No "Program Plans" folder in ${folder.name}. Add the program plan folder link in Configure → What families see.` };
  }
}

async function syncCentre(
  service: { id: string; name: string; content: Prisma.JsonValue },
  folders: CentreFolder[],
  opts: { force?: boolean; read?: typeof extractProgramPlan },
): Promise<CentreSyncResult> {
  const base = { serviceId: service.id, serviceName: service.name };
  const found = await locatePlans(service, folders);
  if ("error" in found) return { ...base, status: "no_plan", message: found.error };
  const { driveId } = found;
  const plans = found.files
    .sort((a, b) => b.lastModifiedDateTime.localeCompare(a.lastModifiedDateTime))
    .slice(0, FILES_PER_CENTRE);

  const seen = await prisma.programPlanSync.findMany({
    where: { serviceId: service.id, itemId: { in: plans.map((p) => p.id) } },
  });
  const done: string[] = [];
  for (const file of plans) {
    const prior = seen.find((s) => s.itemId === file.id);
    if (!opts.force && prior?.status === "ok" && prior.eTag === etagOf(file)) continue;
    const record = { fileName: file.name, webUrl: file.webUrl, eTag: etagOf(file), syncedAt: new Date() };
    try {
      const pdf = await downloadAsPdf(driveId, file);
      const plan: ProgramPlan = await (opts.read ?? extractProgramPlan)(pdf, file.name);
      await prisma.$transaction(async (tx) => {
        for (const w of plan.weeks) await writePlanWeek(tx, service.id, w);
      });
      const weeks = plan.weeks.map((w) => ({ weekStart: w.weekStart, title: w.title, question: w.question ?? null }));
      await prisma.programPlanSync.upsert({
        where: { serviceId_itemId: { serviceId: service.id, itemId: file.id } },
        update: { ...record, status: "ok", error: null, weeks },
        create: { serviceId: service.id, itemId: file.id, ...record, status: "ok", weeks },
      });
      done.push(file.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Program plan sync failed", { serviceId: service.id, file: file.name, err });
      await prisma.programPlanSync.upsert({
        where: { serviceId_itemId: { serviceId: service.id, itemId: file.id } },
        update: { ...record, status: "error", error: message },
        create: { serviceId: service.id, itemId: file.id, ...record, status: "error", error: message },
      });
      return { ...base, status: "error", message: `${file.name}: ${message}`, files: done };
    }
  }
  return done.length ? { ...base, status: "synced", files: done } : { ...base, status: "unchanged" };
}

export function isProgramPlanSyncConfigured() {
  return isGraphConfigured() && !!process.env.ANTHROPIC_API_KEY;
}

/** Every active centre (nightly), or one (the "Sync now" button). */
export async function runProgramPlanSync(
  opts: {
    serviceId?: string;
    force?: boolean;
    read?: typeof extractProgramPlan;
    /** Stop starting new centres after this instant; the next run picks them up. */
    deadline?: number;
  } = {},
): Promise<CentreSyncResult[]> {
  const services = await prisma.service.findMany({
    where: opts.serviceId ? { id: opts.serviceId } : { status: "active" },
    select: { id: true, name: true, content: true },
    orderBy: { name: "asc" },
  });
  const folders = await listCentreFolders();
  const results: CentreSyncResult[] = [];
  for (const s of services) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    results.push(await syncCentre(s, folders, opts));
  }
  return results;
}
