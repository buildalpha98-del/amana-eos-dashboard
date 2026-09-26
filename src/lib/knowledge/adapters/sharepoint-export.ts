/**
 * Slice-1 SharePoint ingest from a LOCAL export directory (spec §5.1).
 * The export is produced interactively (see scripts/export-sharepoint-knowledge/README.md);
 * this adapter is pure over the files + Prisma and is reused by the
 * slice-2b Graph sync for classification and centre mapping.
 *
 * This is the PII boundary for the AI: employment contracts, WWCC / visa /
 * police-check scans, payslips and staff files must never reach the store.
 * The skip rules below are deliberately over-inclusive — a wrongly skipped
 * procedure costs one re-export; a wrongly imported contract is a breach.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { KnowledgeCategory } from "@prisma/client";
import { upsertKnowledgeSource, excludeSources } from "../pipeline";
import { hashContent, normalizeTitle, parseFilenameMeta, canonicalState } from "../normalize";

export interface PathClass {
  tree: "reg168" | "state" | "sop" | "centre" | null;
  category: KnowledgeCategory;
  centreFolder: string | null;
  skip: boolean;
}

// Tested against "/" + the full normalised path, so a suffix ("Amana OSHC AUDIT 2026/") still skips.
const SKIP_DIRS = [/\/Amana OSHC AUDIT[^/]*\//i, /Amana HR Management Review Audit/i];
// PII floor from spec §5 plus the staff-compliance scans centre folders hold.
// Tested against the FULL path, not the basename: a folder named "Staff
// Contracts" or "WWCC" holds PII whatever its files are called.
// Word-bounded so "Contractor Induction Procedure" is NOT skipped.
// `resume` also matches "Resume play after…" — accepted, over-skipping is the
// safe direction; do not narrow.
const PII_WORDS = /\bcontracts?\b|payslip|\bTFN\b|candidate|resume|\bCV\b|\bWWCC\b|passport|\bvisa\b|police\s*(check|cert)|working\s*with\s*children|staff\s*files?|personnel|employee\s*records?/i;
// ALLOWLIST on the basename: the export only ever holds text extracted from
// Word / PDF documents, so anything else (.msg, .txt, images, spreadsheets,
// decks) is not a knowledge document and skips.
const IMPORTABLE_EXT = /\.(docx?|pdf)$/i;
const CENTRE_ROOTS = ["NSW Schools/", "Melbourne Schools/"];
const REG168_ROOT = "NSW Schools/Amana OSHC - NSW Service Approval - Reg 168 Policies and Procedures/";
const STATE_ROOT = "Shared Documents/NSW & VIC state policies/";
const SOP_ROOT = "Shared Documents/SOPs/Jayden full SOP/";

export function classifyPath(p: string): PathClass {
  const norm = p.replace(/\\/g, "/");
  const skip = (): PathClass => ({ tree: null, category: "guide", centreFolder: null, skip: true });
  const base = path.basename(norm);
  if (SKIP_DIRS.some((r) => r.test("/" + norm)) || PII_WORDS.test(norm) || !IMPORTABLE_EXT.test(base)) return skip();
  const fileCat = parseFilenameMeta(base).category;
  // For the two policy libraries the {Policies,Procedures} subfolder is authoritative (spec §5); filename is the fallback.
  const subfolderCat = (root: string): KnowledgeCategory => {
    const seg = norm.slice(root.length).split("/")[0]?.toLowerCase();
    return seg === "policies" ? "policy" : seg === "procedures" ? "procedure" : fileCat;
  };
  if (norm.startsWith(REG168_ROOT)) return { tree: "reg168", category: subfolderCat(REG168_ROOT), centreFolder: null, skip: false };
  if (norm.startsWith(STATE_ROOT)) return { tree: "state", category: subfolderCat(STATE_ROOT), centreFolder: null, skip: false };
  if (norm.startsWith(SOP_ROOT)) return { tree: "sop", category: "sop", centreFolder: null, skip: false };
  for (const root of CENTRE_ROOTS) {
    if (norm.startsWith(root)) {
      const centreFolder = norm.slice(root.length).split("/")[0] || null;
      return { tree: "centre", category: fileCat === "policy" ? "policy" : "procedure", centreFolder, skip: false };
    }
  }
  return skip();
}

function nameKey(s: string): string {
  return s.toLowerCase().replace(/amana\s*oshc/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Token-bounded containment: "hub" is inside "the hub" but not "hubert street". */
function containsTokens(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

/**
 * Folder "Amana OSHC - Minaret Doveton" → Service id. Exact normalised
 * match first; otherwise token-bounded containment either way — but only
 * when exactly ONE service contains / is contained by the folder. "Minaret"
 * and "Minaret Doveton" are both real centres, so a containment hit that
 * fits two services is ambiguous and reads as unmapped (null) rather
 * than silently scoping the document to the wrong centre.
 */
export function matchServiceByFolder(folder: string, services: { id: string; name: string }[]): string | null {
  const f = nameKey(folder);
  if (!f) return null;
  const keyed = services.map((s) => ({ id: s.id, key: nameKey(s.name) })).filter((s) => s.key);
  const exact = keyed.find((s) => s.key === f);
  if (exact) return exact.id;
  const contained = keyed.filter((s) => containsTokens(s.key, f) || containsTokens(f, s.key));
  return contained.length === 1 ? contained[0].id : null;
}

export interface ExportFile {
  id: string; name: string; webUrl: string; path: string; lastModified: string; text: string;
}

export function parseExportFile(raw: string): ExportFile {
  // Exports written on Windows (or through Notepad) carry a BOM and CRLF.
  const src = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("Missing frontmatter");
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const k of ["id", "name", "webUrl", "path", "lastModified"]) {
    if (!meta[k]) throw new Error(`Missing frontmatter key: ${k}`);
  }
  return { id: meta.id, name: meta.name, webUrl: meta.webUrl, path: meta.path, lastModified: meta.lastModified, text: m[2].trim() };
}

/** Every `.md` under `dir`, recursively, as absolute paths in sorted order. */
export async function listExportFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listExportFiles(full)));
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

export interface ImportReport {
  /**
   * `superseded` is the store-wide total after the run, not a per-run delta
   * (0 in dry mode — nothing was written). In dry mode `imported` counts
   * "would import".
   */
  counts: { imported: number; unchanged: number; superseded: number; conflicts: number; unmapped: number; skipped: number; errors: number };
  /** Every non-skipped file that parsed, in walk order — the dry-run eyeball list. */
  files: { path: string; tree: NonNullable<PathClass["tree"]>; category: KnowledgeCategory; serviceId: string | null; serviceName: string | null }[];
  conflicts: { normalizedTitle: string; state: string | null; version: number | null; paths: string[] }[];
  unmapped: { path: string; centreFolder: string }[];
  skipped: { path: string; reason: string }[];
  errors: { path: string; error: string }[];
  /** Dry-mode degradations the operator must read (e.g. the Service lookup failed). */
  warnings: string[];
}

export interface ImportOptions {
  /**
   * Parse + classify + map services + detect conflicts/unmapped, but perform
   * NO upsert and NO exclusion. The Service lookup is still attempted (it is
   * read-only and the unmapped list is part of the gate); if the database is
   * unreachable it degrades to "every centre folder unmapped" with a warning.
   */
  dry?: boolean;
}

const PROGRESS_EVERY = 25;

/** Prisma's connection errors quote the whole invocation; keep the one line that says what went wrong. */
function briefError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lines = msg.split("\n").map((l) => l.trim()).filter(Boolean);
  // Drop the invocation header, the numbered/arrowed source excerpt and the file-path line.
  return lines.find((l) => !/^(\d+|→)/.test(l) && !l.startsWith("Invalid `prisma") && !/^(\/|[A-Za-z]:\\)/.test(l)) ?? msg;
}

export async function importExportDir(dir: string, opts: ImportOptions = {}): Promise<ImportReport> {
  const dry = opts.dry === true;
  const report: ImportReport = {
    counts: { imported: 0, unchanged: 0, superseded: 0, conflicts: 0, unmapped: 0, skipped: 0, errors: 0 },
    files: [], conflicts: [], unmapped: [], skipped: [], errors: [], warnings: [],
  };
  let services: { id: string; name: string }[] = [];
  try {
    services = await prisma.service.findMany({ select: { id: true, name: true } });
  } catch (err) {
    if (!dry) throw err;
    const error = briefError(err);
    report.warnings.push(`Service lookup failed (${error}) — every centre folder is reported as unmapped; re-run --dry against the target database before importing.`);
    logger.warn("Knowledge: dry run could not read services", { error });
  }
  const files = await listExportFiles(dir);
  const total = files.length;
  logger.info("Knowledge: export import started", { dir, total, dry });

  // Conflict bookkeeping: per dedupe key (normalizedTitle,state,serviceId,version),
  // every distinct content hash and the paths carrying it. Emitted AFTER the
  // loop so a key with three differing copies yields ONE conflict listing all
  // three, not one per extra copy.
  const byKey = new Map<string, { normalizedTitle: string; state: string | null; version: number | null; hashes: Map<string, string[]> }>();

  let done = 0;
  for (const full of files) {
    const rel = path.relative(dir, full).replace(/\\/g, "/").replace(/\.md$/, "");
    try {
      const f = parseExportFile(await fs.readFile(full, "utf8"));
      // The frontmatter path is what SharePoint said; the on-disk path is what
      // the exporter wrote. They are meant to be identical — classify on the
      // frontmatter and flag drift rather than silently picking one.
      if (f.path.replace(/\\/g, "/") !== rel) {
        logger.warn("Knowledge: export frontmatter path differs from on-disk path", { file: rel, path: f.path });
      }
      const cls = classifyPath(f.path);
      if (cls.skip || !cls.tree) { report.skipped.push({ path: f.path, reason: "skip rule" }); report.counts.skipped++; continue; }

      let serviceId: string | null = null;
      let unmapped = false;
      if (cls.tree === "centre" && cls.centreFolder) {
        serviceId = matchServiceByFolder(cls.centreFolder, services);
        if (!serviceId) { unmapped = true; report.unmapped.push({ path: f.path, centreFolder: cls.centreFolder }); report.counts.unmapped++; }
      }
      report.files.push({ path: f.path, tree: cls.tree, category: cls.category, serviceId, serviceName: services.find((s) => s.id === serviceId)?.name ?? null });

      const meta = parseFilenameMeta(f.name);
      const state = canonicalState(meta.state);
      const normalizedTitle = normalizeTitle(f.name);
      const key = `${normalizedTitle}|${state ?? ""}|${serviceId ?? ""}|${meta.version ?? ""}`;
      const hash = hashContent(f.text);
      let entry = byKey.get(key);
      if (!entry) { entry = { normalizedTitle, state, version: meta.version, hashes: new Map() }; byKey.set(key, entry); }
      const carriers = entry.hashes.get(hash);
      if (carriers) carriers.push(f.path); else entry.hashes.set(hash, [f.path]);

      if (dry) { report.counts.imported++; continue; }

      const res = await upsertKnowledgeSource({
        sourceKind: "sharepoint",
        externalId: f.id,
        title: f.name,
        category: cls.category,
        text: f.text,
        externalUrl: f.webUrl,
        serviceId,
        state,
        qualityArea: meta.qualityArea,
        version: meta.version,
      });
      if (res.outcome === "error") { report.errors.push({ path: f.path, error: res.error ?? "unknown" }); report.counts.errors++; continue; }
      if (unmapped) {
        // excludeSources' adapter variant touches ACTIVE rows only, so an
        // admin exclusion is never overwritten. The pipeline self-heals: once
        // a Service exists that matches the folder, the next import's upsert
        // hits its reactivate branch (adapter-excluded → active); while the
        // folder is still unmapped, this branch re-excludes it on every run.
        await excludeSources({ id: res.sourceId }, "adapter");
      }
      if (res.outcome === "unchanged") report.counts.unchanged++; else report.counts.imported++;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("Knowledge: export import failed for file", { file: rel, error });
      report.errors.push({ path: rel, error }); report.counts.errors++;
    } finally {
      done++;
      if (done % PROGRESS_EVERY === 0 || done === total) logger.info("Knowledge: export import progress", { done, total, dry });
    }
  }

  // Same (normalizedTitle,state,serviceId,version) with different content.
  // Until Daniel resolves a conflict in SharePoint, applySupersession keeps
  // the copy whose store row was written most recently active (on a first
  // import, the alphabetically-last path — files are walked in sorted order)
  // and marks the others `superseded`; the AI answers from that copy meanwhile.
  for (const entry of byKey.values()) {
    if (entry.hashes.size < 2) continue;
    const paths = [...entry.hashes.values()].flat();
    report.conflicts.push({ normalizedTitle: entry.normalizedTitle, state: entry.state, version: entry.version, paths });
    report.counts.conflicts++;
  }

  // Total superseded SharePoint sources after this run (not "this run only" —
  // supersession happens inside upsertKnowledgeSource per key; the V2-vs-V3
  // and unchanged-hash behaviours are covered by the pipeline tests).
  if (!dry) {
    const superseded = await prisma.knowledgeSource.findMany({ where: { sourceKind: "sharepoint", status: "superseded" }, select: { id: true } });
    report.counts.superseded = superseded.length;
  }
  logger.info("Knowledge: export import finished", { ...report.counts, dry });
  return report;
}
