/**
 * Invariants from the Amana AI spec §3.1/§3.2: the knowledge store is fed
 * only by adapters, never by Document rows; the old unscoped routes are gone;
 * the SharePoint importer's PII floor holds; and `status: "excluded"` is
 * written from exactly one place.
 *
 * These are source-text guards, not behaviour tests — each one exists
 * because the failure it prevents is silent (a contract indexed into AI
 * answers, an adapter re-activating an admin's exclusion) and would not
 * surface in a unit test of the code that regressed.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { classifyPath } from "@/lib/knowledge/adapters/sharepoint-export";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}

const ROOT = process.cwd();
// The SharePoint importer script writes KnowledgeSyncRun directly and drives
// the PII-boundary adapter — it must never grow a Document read either.
const GUARDED = [
  "src/lib/knowledge",
  "src/app/api/settings/ai-knowledge",
  "src/lib/embeddings.ts",
  "scripts/import-sharepoint-knowledge.ts",
];

function guardedFiles(): string[] {
  return GUARDED.flatMap((rel) => {
    const abs = path.join(ROOT, rel);
    return statSync(abs).isDirectory() ? walk(abs) : [abs];
  });
}

describe("knowledge store guard", () => {
  it("no guarded module touches Document/DocumentChunk", () => {
    for (const f of guardedFiles()) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/prisma\.document\b/);
      expect(src, f).not.toMatch(/prisma\.documentChunk\b/);
      expect(src, f).not.toMatch(/tx\.documentChunk\b/);
    }
  });

  it("the old unscoped knowledge routes no longer exist", () => {
    expect(existsSync(path.join(ROOT, "src/app/api/knowledge"))).toBe(false);
    // The per-row `[id]/reindex` route is a different, admin-scoped thing and
    // is allowed; these three were the store-wide legacy operations.
    for (const r of ["reindex", "backfill", "dedupe"]) {
      expect(existsSync(path.join(ROOT, `src/app/api/settings/ai-knowledge/${r}`))).toBe(false);
    }
  });

  it("document-indexer no longer exports storage/search", async () => {
    const mod = await import("@/lib/document-indexer");
    for (const name of ["searchChunks", "indexDocument", "indexTextContent", "formatChunksForPrompt"]) {
      expect((mod as Record<string, unknown>)[name], name).toBeUndefined();
    }
  });

  it("the assistant tool list has no search_knowledge_base", async () => {
    const { ASSISTANT_TOOLS } = await import("@/lib/ai-tools");
    const names = ASSISTANT_TOOLS.map((t) => t.name);
    expect(names).not.toContain("search_knowledge_base");
    // The replacement must still be registered, or the guard passes vacuously
    // after someone deletes the whole knowledge tool.
    expect(names).toContain("search_knowledge");
  });

  it("the SharePoint importer's PII floor skips staff files, compliance scans, audit folders and non-documents", () => {
    // Each of these is a real shape from the export. A wrongly imported
    // contract is a breach; a wrongly skipped procedure costs one re-export.
    const mustSkip = [
      "NSW Schools/Amana OSHC - Foo/Staff Contracts/roster.docx", // PII folder word on the path, not the basename
      "NSW Schools/Amana OSHC - Foo/WWCC/J Smith.pdf", // compliance scan folder
      "Shared Documents/SOPs/Amana OSHC AUDIT/x.docx", // audit tree
      "NSW Schools/Amana OSHC - Foo/photo.png", // not a Word/PDF document
      "NSW Schools/Amana OSHC - Foo/Payslip March.pdf",
      "Shared Documents/SOPs/Jayden full SOP/Employee Records Procedure.docx",
    ];
    for (const p of mustSkip) {
      expect(classifyPath(p).skip, p).toBe(true);
    }
    // And the floor must not have swallowed the documents it exists to admit.
    const mustImport = [
      "NSW Schools/Amana OSHC - Foo/Sun Safety Procedure.docx",
      "Shared Documents/SOPs/Jayden full SOP/Contractor Induction Procedure.docx", // word-bounded: "contractor" is not "contract"
    ];
    for (const p of mustImport) {
      expect(classifyPath(p).skip, p).toBe(false);
    }
  });

  it('only pipeline.ts writes `status: "excluded"` in the knowledge lib and admin routes', () => {
    // Allow-list, by design:
    //   - src/lib/knowledge/pipeline.ts: `excludeSources()` is THE writer. It
    //     records `excludedBy` so an adapter can only undo its own exclusions
    //     and never overwrites an admin's decision.
    // Everything else — every adapter, the admin PATCH — must go through it or
    // pass a status VARIABLE (the admin PATCH does: `data.status = status`),
    // so a literal `status: "excluded"` anywhere else is a second writer that
    // will silently skip the `excludedBy` bookkeeping.
    const ALLOWED = new Set([path.join(ROOT, "src/lib/knowledge/pipeline.ts")]);
    const offenders = guardedFiles().filter(
      (f) => !ALLOWED.has(f) && /status:\s*["']excluded["']/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
    // Self-check so the assertion can't pass because the pattern rotted:
    // pipeline.ts itself must still contain the literal.
    expect(readFileSync(path.join(ROOT, "src/lib/knowledge/pipeline.ts"), "utf8")).toMatch(/status:\s*"excluded"/);
  });
});
