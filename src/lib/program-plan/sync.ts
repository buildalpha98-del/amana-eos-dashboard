/**
 * SharePoint → Program and Menu (Daniel, 2026-10-12).
 *
 * Each centre's term folder lives inside its school folder:
 *   <NSW Schools | Melbourne Schools>/Amana OSHC - <Centre>/Term 4 2026 Program/
 *     …Weekly_Program_Plan…pdf   → Program (activities; food too if no menu)
 *     …Menus…pdf                 → Menu (meals, allergens, alternatives)
 *     …Centre_Insert…pdf         → ignored (staff handout)
 * The newest "Term N YYYY Program" folder wins, so next term's folder is
 * picked up with nothing to change. A folder link saved on the centre
 * (Configure → What families see → "Program plan folder") overrides that;
 * the older QA1 "Program Plans" folder is the last resort.
 *
 * Nightly (and on "Sync now") each file is skipped if its etag hasn't
 * changed; otherwise Claude reads it (extract.ts) and each week is written.
 *
 * Coordinator edits always survive: only rows still marked
 * `source: "sharepoint"` (untouched since import) are replaced, and a new row
 * never takes a day/time or day/meal slot a person already filled.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { graphGet, downloadAsPdf, isGraphConfigured, type DriveItem } from "@/lib/ms-graph";
import { mergeServiceContent } from "@/lib/service-content-shared";
import {
  extractMenu,
  extractProgramPlan,
  type MenuPlan,
  type MenuPlanWeek,
  type ProgramPlan,
  type ProgramPlanWeek,
} from "./extract";

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

/** "Term 4 2026 Program" — the newest one is this term's. */
const TERM_FOLDER = /^term\s*([1-4])\s*(\d{4})\s*program/i;
const LEGACY_PLANS_PATH = ["QA1 - Educational Program & Practice", "Program Plans"];
const PLAN_FILE = /program.?plan.*\.pdf$/i;
const MENU_FILE = /menu.*\.pdf$/i;
const SKIP_FOLDER = /archive|old|superseded|previous/i;
/** The newest files of each kind — older months are history, not something to re-read. */
const FILES_PER_KIND = 2;

/**
 * Pilot (Daniel, 2026-10-12: "test that out with AIA Coburg first"): the
 * nightly run only syncs centres whose name matches. "Sync now" works for
 * any centre. Set to null to sync every centre nightly.
 */
export const NIGHTLY_PILOT: RegExp | null = /\baia\b/i;

export const IMPORTED = "sharepoint";

interface CentreFolder {
  driveId: string;
  id: string;
  name: string;
  driveWebUrl: string;
}

/** Folder names that don't follow the centre's name in the dashboard. */
const FOLDER_ALIASES: Record<string, string> = {
  "aia coburg": "aia kkcc",
};

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
  const keys = [full, tail, words.join("")];
  if (FOLDER_ALIASES[full]) keys.push(FOLDER_ALIASES[full]);
  return [...new Set(keys)];
}

/** Pick the centre's folder: its saved SharePoint link first, then its name. */
export function matchCentreFolder<F extends Omit<CentreFolder, "id">>(
  service: { name: string; sharepointUrl: string },
  folders: F[],
): F | { error: string } {
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
        ? `No SharePoint folder matches "${service.name}". Paste the centre's program folder link in Configure → What families see.`
        : `More than one SharePoint folder matches "${service.name}" (${hits.map((h) => h.name).join(", ")}). Paste the right folder link in Configure → What families see.`,
  };
}

/** The newest "Term N YYYY Program" folder name in a list, or null. */
export function newestTermFolder<T extends { name: string }>(items: T[]): T | null {
  const terms = items
    .map((i) => ({ i, m: TERM_FOLDER.exec(i.name) }))
    .filter((x): x is { i: T; m: RegExpExecArray } => !!x.m)
    .sort((a, b) => Number(b.m[2]) - Number(a.m[2]) || Number(b.m[1]) - Number(a.m[1]));
  return terms[0]?.i ?? null;
}

type Page = { value: DriveItem[]; "@odata.nextLink"?: string };

async function children(driveId: string, itemId: string | null): Promise<DriveItem[]> {
  const out: DriveItem[] = [];
  let next: string | undefined = itemId
    ? `/drives/${driveId}/items/${itemId}/children?$top=200`
    : `/drives/${driveId}/root/children?$top=200`;
  while (next) {
    const page: Page = await graphGet(next);
    out.push(...page.value);
    next = page["@odata.nextLink"];
  }
  return out;
}

async function listCentreFolders(): Promise<CentreFolder[]> {
  const out: CentreFolder[] = [];
  for (const driveId of CENTRE_DRIVES) {
    const drive = await graphGet<{ webUrl: string }>(`/drives/${driveId}`);
    for (const item of await children(driveId, null)) {
      if (item.folder) out.push({ driveId, id: item.id, name: item.name, driveWebUrl: drive.webUrl });
    }
  }
  return out;
}

/** Every file under a folder, skipping archive-type subfolders. */
async function listFiles(driveId: string, itemId: string): Promise<DriveItem[]> {
  const out: DriveItem[] = [];
  const queue = [itemId];
  let guard = 0;
  while (queue.length && guard++ < 50) {
    for (const item of await children(driveId, queue.shift()!)) {
      if (item.folder && !SKIP_FOLDER.test(item.name)) queue.push(item.id);
      else if (item.file) out.push(item);
    }
  }
  return out;
}

const etagOf = (f: DriveItem) => f.cTag ?? f.eTag ?? f.lastModifiedDateTime;
const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);
type Day = ProgramPlanWeek["closedDays"][number];

/**
 * Write one week's activities (and its meals, when the centre has no menu
 * file). Imported rows nobody has touched are replaced; rows a coordinator
 * made or edited are kept, and an imported row never takes their slot. Two
 * imported activities can't share a start time on one day (the table's
 * unique key), so a clash folds the second into the first.
 */
export async function writePlanWeek(
  tx: Prisma.TransactionClient,
  serviceId: string,
  w: ProgramPlanWeek,
  opts: { meals?: boolean } = {},
) {
  const weekStart = dateOnly(w.weekStart);
  const open = (d: string) => !w.closedDays.includes(d as Day);

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

  if (opts.meals === false) return { activities: rows.size, meals: 0 };
  const meals = await writeMeals(
    tx,
    serviceId,
    w.weekStart,
    w.meals.filter((m) => open(m.day)).map((m) => ({ ...m, allergens: [] })),
  );
  return { activities: rows.size, meals };
}

/** One week of the centre's menu file. */
export async function writeMenuWeek(tx: Prisma.TransactionClient, serviceId: string, w: MenuPlanWeek) {
  return writeMeals(
    tx,
    serviceId,
    w.weekStart,
    w.meals.filter((m) => !w.closedDays.includes(m.day as Day)),
  );
}

async function writeMeals(
  tx: Prisma.TransactionClient,
  serviceId: string,
  weekStartIso: string,
  meals: { day: string; slot: string; description: string; allergens: string[] }[],
) {
  if (meals.length === 0) return 0;
  const weekStart = dateOnly(weekStartIso);
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
      day: m.day as Prisma.MenuItemCreateManyInput["day"],
      slot: m.slot as Prisma.MenuItemCreateManyInput["slot"],
      description: m.description,
      allergens: m.allergens,
      source: IMPORTED,
    })),
    skipDuplicates: true,
  });
  return created.count;
}

export interface CentreSyncResult {
  serviceId: string;
  serviceName: string;
  status: "synced" | "unchanged" | "no_plan" | "error";
  message?: string;
  files?: string[];
  /** Where the files were found, e.g. "Amana OSHC - AIA KKCC/Term 4 2026 Program". */
  folder?: string;
}

/** Graph's id for any SharePoint link: "u!" + unpadded base64url of the URL. */
export function shareId(url: string) {
  return `u!${Buffer.from(url.trim()).toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-")}`;
}

interface Located {
  driveId: string;
  folder: string;
  plans: DriveItem[];
  menus: DriveItem[];
}

const newestFirst = (a: DriveItem, b: DriveItem) => b.lastModifiedDateTime.localeCompare(a.lastModifiedDateTime);

function sortFiles(driveId: string, folder: string, files: DriveItem[]): Located | { error: string } {
  const plans = files.filter((f) => PLAN_FILE.test(f.name)).sort(newestFirst).slice(0, FILES_PER_KIND);
  const menus = files.filter((f) => MENU_FILE.test(f.name) && !PLAN_FILE.test(f.name)).sort(newestFirst).slice(0, FILES_PER_KIND);
  if (plans.length === 0 && menus.length === 0) {
    return { error: `No program plan or menu PDF in ${folder} yet.` };
  }
  return { driveId, folder, plans, menus };
}

/** Where this centre's program plan and menu are (see the header). */
async function locatePlans(
  service: { name: string; content: Prisma.JsonValue },
  folders: CentreFolder[],
): Promise<Located | { error: string }> {
  const content = mergeServiceContent(service.content);
  const link = content.programPlanFolderUrl.trim();
  if (link) {
    if (!/^https:\/\/[^/]+\.sharepoint\.com\//i.test(link)) {
      return { error: "The program folder link isn't a SharePoint link. Copy it again from SharePoint." };
    }
    try {
      const item = await graphGet<DriveItem & { parentReference?: { driveId?: string } }>(
        `/shares/${shareId(link)}/driveItem`,
      );
      const driveId = item.parentReference?.driveId;
      if (!item.folder || !driveId) return { error: "The program folder link points at a file, not a folder." };
      return sortFiles(driveId, item.name, await listFiles(driveId, item.id));
    } catch {
      return { error: "Couldn't open the program folder link. Check it's the right folder and copy the link again." };
    }
  }

  const centre = matchCentreFolder({ name: service.name, sharepointUrl: content.sharepointUrl }, folders);
  if ("error" in centre) return centre;
  const inside = await children(centre.driveId, centre.id);
  const term = newestTermFolder(inside.filter((i) => i.folder));
  if (term) {
    return sortFiles(centre.driveId, `${centre.name}/${term.name}`, await listFiles(centre.driveId, term.id));
  }
  // Before the term folders existed: QA1 › Program Plans.
  const qa1 = inside.find((i) => i.folder && i.name === LEGACY_PLANS_PATH[0]);
  const legacy = qa1 && (await children(centre.driveId, qa1.id)).find((i) => i.folder && i.name === LEGACY_PLANS_PATH[1]);
  if (legacy) {
    return sortFiles(centre.driveId, `${centre.name}/${LEGACY_PLANS_PATH.join("/")}`, await listFiles(centre.driveId, legacy.id));
  }
  return { error: `No "Term … Program" folder in ${centre.name} yet.` };
}

interface Readers {
  readPlan?: typeof extractProgramPlan;
  readMenu?: typeof extractMenu;
}

async function syncCentre(
  service: { id: string; name: string; content: Prisma.JsonValue },
  folders: CentreFolder[],
  opts: { force?: boolean } & Readers,
): Promise<CentreSyncResult> {
  const base = { serviceId: service.id, serviceName: service.name };
  const found = await locatePlans(service, folders);
  if ("error" in found) return { ...base, status: "no_plan", message: found.error };
  const { driveId, folder } = found;
  // When the folder has a menu file, it is the menu; the plan's food lines aren't used.
  const hasMenuFile = found.menus.length > 0;

  const files = [
    ...found.plans.map((file) => ({ file, kind: "plan" as const })),
    ...found.menus.map((file) => ({ file, kind: "menu" as const })),
  ];
  const seen = await prisma.programPlanSync.findMany({
    where: { serviceId: service.id, itemId: { in: files.map((f) => f.file.id) } },
  });
  const done: string[] = [];
  for (const { file, kind } of files) {
    const prior = seen.find((s) => s.itemId === file.id);
    if (!opts.force && prior?.status === "ok" && prior.eTag === etagOf(file)) continue;
    const record = { fileName: file.name, webUrl: file.webUrl, eTag: etagOf(file), syncedAt: new Date() };
    try {
      const pdf = await downloadAsPdf(driveId, file);
      let weeks: Prisma.InputJsonValue | undefined;
      if (kind === "plan") {
        const plan: ProgramPlan = await (opts.readPlan ?? extractProgramPlan)(pdf, file.name);
        await prisma.$transaction(async (tx) => {
          for (const w of plan.weeks) await writePlanWeek(tx, service.id, w, { meals: !hasMenuFile });
        });
        weeks = plan.weeks.map((w) => ({ weekStart: w.weekStart, title: w.title, question: w.question ?? null }));
      } else {
        const menu: MenuPlan = await (opts.readMenu ?? extractMenu)(pdf, file.name);
        await prisma.$transaction(async (tx) => {
          for (const w of menu.weeks) await writeMenuWeek(tx, service.id, w);
        });
      }
      await prisma.programPlanSync.upsert({
        where: { serviceId_itemId: { serviceId: service.id, itemId: file.id } },
        update: { ...record, status: "ok", error: null, ...(weeks ? { weeks } : {}) },
        create: { serviceId: service.id, itemId: file.id, ...record, status: "ok", ...(weeks ? { weeks } : {}) },
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
      return { ...base, status: "error", folder, message: `${file.name}: ${message}`, files: done };
    }
  }
  return done.length
    ? { ...base, status: "synced", folder, files: done }
    : { ...base, status: "unchanged", folder };
}

export function isProgramPlanSyncConfigured() {
  return isGraphConfigured() && !!process.env.ANTHROPIC_API_KEY;
}

/** Every active centre (nightly, within the pilot), or one (the "Sync now" button). */
export async function runProgramPlanSync(
  opts: {
    serviceId?: string;
    force?: boolean;
    /** Stop starting new centres after this instant; the next run picks them up. */
    deadline?: number;
  } & Readers = {},
): Promise<CentreSyncResult[]> {
  const services = (
    await prisma.service.findMany({
      where: opts.serviceId ? { id: opts.serviceId } : { status: "active" },
      select: { id: true, name: true, content: true },
      orderBy: { name: "asc" },
    })
  ).filter((s) => opts.serviceId || !NIGHTLY_PILOT || NIGHTLY_PILOT.test(s.name));
  const folders = await listCentreFolders();
  const results: CentreSyncResult[] = [];
  for (const s of services) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    results.push(await syncCentre(s, folders, opts));
  }
  return results;
}
