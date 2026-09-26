/**
 * Slice-1 SharePoint ingest from a LOCAL export directory (spec §5.1).
 * The export is produced interactively (see scripts/export-sharepoint-knowledge/README.md);
 * this adapter is pure over the files + Prisma and is reused by the
 * slice-2b Graph sync for classification and centre mapping.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { KnowledgeCategory } from "@prisma/client";
import { upsertKnowledgeSource } from "../pipeline";
import { hashContent, normalizeTitle, parseFilenameMeta, canonicalState } from "../normalize";

export interface PathClass {
  tree: "reg168" | "state" | "sop" | "centre" | null;
  category: KnowledgeCategory;
  centreFolder: string | null;
  skip: boolean;
}

const SKIP_DIRS = [/\/Amana OSHC AUDIT\//i, /Amana HR Management Review Audit/i];
// PII floor from spec §5 plus the staff-compliance scans centre folders hold.
// Word-bounded so "Contractor Induction Procedure" is NOT skipped.
const SKIP_FILES = /\bcontracts?\b|payslip|\bTFN\b|candidate|resume|\bCV\b|\bWWCC\b|passport|\bvisa\b|police\s*check|\.(png|jpe?g|gif|xlsx?|csv|pptx?)$/i;
const CENTRE_ROOTS = ["NSW Schools/", "Melbourne Schools/"];
const REG168_ROOT = "NSW Schools/Amana OSHC - NSW Service Approval - Reg 168 Policies and Procedures/";
const STATE_ROOT = "Shared Documents/NSW & VIC state policies/";
const SOP_ROOT = "Shared Documents/SOPs/Jayden full SOP/";

export function classifyPath(p: string): PathClass {
  const norm = p.replace(/\\/g, "/");
  const skip = (): PathClass => ({ tree: null, category: "guide", centreFolder: null, skip: true });
  if (SKIP_DIRS.some((r) => r.test("/" + norm)) || SKIP_FILES.test(path.basename(norm))) return skip();
  const fileCat = parseFilenameMeta(path.basename(norm)).category;
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

/**
 * Folder "Amana OSHC - Minaret Doveton" → Service id. Exact normalised
 * match first; otherwise containment either way — but only when exactly
 * ONE service contains / is contained by the folder. "Minaret" and
 * "Minaret Doveton" are both real centres, so a containment hit that
 * fits two services is ambiguous and reads as unmapped (null) rather
 * than silently scoping the document to the wrong centre.
 */
export function matchServiceByFolder(folder: string, services: { id: string; name: string }[]): string | null {
  const f = nameKey(folder);
  if (!f) return null;
  const keyed = services.map((s) => ({ id: s.id, key: nameKey(s.name) })).filter((s) => s.key);
  const exact = keyed.find((s) => s.key === f);
  if (exact) return exact.id;
  const contained = keyed.filter((s) => s.key.includes(f) || f.includes(s.key));
  return contained.length === 1 ? contained[0].id : null;
}

export interface ExportFile {
  id: string; name: string; webUrl: string; path: string; lastModified: string; text: string;
}

export function parseExportFile(raw: string): ExportFile {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
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

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

export interface ImportReport {
  /** `superseded` is the store-wide total after the run, not a per-run delta. */
  counts: { imported: number; unchanged: number; superseded: number; conflicts: number; unmapped: number; skipped: number; errors: number };
  conflicts: { normalizedTitle: string; state: string | null; version: number | null; paths: string[] }[];
  unmapped: { path: string; centreFolder: string }[];
  skipped: { path: string; reason: string }[];
  errors: { path: string; error: string }[];
}

export async function importExportDir(dir: string): Promise<ImportReport> {
  const report: ImportReport = {
    counts: { imported: 0, unchanged: 0, superseded: 0, conflicts: 0, unmapped: 0, skipped: 0, errors: 0 },
    conflicts: [], unmapped: [], skipped: [], errors: [],
  };
  const services = await prisma.service.findMany({ select: { id: true, name: true } });
  const files = await walk(dir);

  // conflict detection: same (normalizedTitle,state,serviceId,version) with different content
  const seen = new Map<string, { hash: string; paths: string[] }>();

  for (const full of files) {
    const rel = path.relative(dir, full).replace(/\.md$/, "");
    try {
      const f = parseExportFile(await fs.readFile(full, "utf8"));
      const cls = classifyPath(f.path || rel);
      if (cls.skip) { report.skipped.push({ path: f.path, reason: "skip rule" }); report.counts.skipped++; continue; }

      let serviceId: string | null = null;
      let unmapped = false;
      if (cls.tree === "centre" && cls.centreFolder) {
        serviceId = matchServiceByFolder(cls.centreFolder, services);
        if (!serviceId) { unmapped = true; report.unmapped.push({ path: f.path, centreFolder: cls.centreFolder }); report.counts.unmapped++; }
      }

      const meta = parseFilenameMeta(f.name);
      const state = canonicalState(meta.state);
      const key = `${normalizeTitle(f.name)}|${state ?? ""}|${serviceId ?? ""}|${meta.version ?? ""}`;
      const hash = hashContent(f.text);
      const prev = seen.get(key);
      if (prev && prev.hash !== hash) {
        prev.paths.push(f.path);
        report.conflicts.push({ normalizedTitle: normalizeTitle(f.name), state, version: meta.version, paths: [...prev.paths] });
        report.counts.conflicts++;
      } else if (!prev) {
        seen.set(key, { hash, paths: [f.path] });
      }

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
        // "adapter", so the pipeline self-heals: once a Service exists that
        // matches the folder, the next import re-activates the row; while it
        // is still unmapped, this branch re-excludes it on every run.
        await prisma.knowledgeSource.update({ where: { id: res.sourceId }, data: { status: "excluded", excludedBy: "adapter" } });
      }
      if (res.outcome === "unchanged") report.counts.unchanged++; else report.counts.imported++;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("Knowledge: export import failed for file", { file: rel, error });
      report.errors.push({ path: rel, error }); report.counts.errors++;
    }
  }

  // Total superseded SharePoint sources after this run (not "this run only" —
  // supersession happens inside upsertKnowledgeSource per key; the V2-vs-V3
  // and unchanged-hash behaviours are covered by the pipeline tests).
  const superseded = await prisma.knowledgeSource.findMany({ where: { sourceKind: "sharepoint", status: "superseded" }, select: { id: true } });
  report.counts.superseded = superseded.length;
  return report;
}
