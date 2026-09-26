import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import { prismaMock } from "../../../helpers/prisma-mock";
import type { UpsertResult } from "@/lib/knowledge/types";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const { loggerMock } = vi.hoisted(() => ({ loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: loggerMock }));
const { upsert, upsertCreated } = vi.hoisted(() => {
  const upsertCreated = async (i: { externalId: string }): Promise<UpsertResult> => ({ sourceId: `src-${i.externalId}`, outcome: "created" });
  return { upsertCreated, upsert: vi.fn<(i: { externalId: string }) => Promise<UpsertResult>>(upsertCreated) };
});
// excludeSources stays REAL so the test proves the adapter goes through the
// active-only updateMany (an admin exclusion must never be overwritten).
vi.mock("@/lib/knowledge/pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/knowledge/pipeline")>();
  return { ...actual, upsertKnowledgeSource: (i: unknown) => upsert(i as { externalId: string }) };
});

import { classifyPath, matchServiceByFolder, parseExportFile, importExportDir, listExportFiles } from "@/lib/knowledge/adapters/sharepoint-export";

const FIX = path.join(process.cwd(), "src/__tests__/fixtures/knowledge-export");
// 8 fixture files: 7 importable (3 Bushfire copies, Rest Time V2 + V3, OPS-10, toilet) + 1 under AUDIT.
const FIXTURE_IMPORTABLE = 7;

describe("classifyPath", () => {
  it("maps each tree to category + scope", () => {
    expect(classifyPath("NSW Schools/Amana OSHC - NSW Service Approval - Reg 168 Policies and Procedures/Policies/x.docx")).toEqual({ tree: "reg168", category: "policy", centreFolder: null, skip: false });
    expect(classifyPath("Shared Documents/NSW & VIC state policies/Procedures/x.docx")).toEqual({ tree: "state", category: "procedure", centreFolder: null, skip: false });
    expect(classifyPath("Shared Documents/SOPs/Jayden full SOP/6. Centre Operations/OPS-10.docx")).toEqual({ tree: "sop", category: "sop", centreFolder: null, skip: false });
    expect(classifyPath("Melbourne Schools/Amana OSHC - Minaret Doveton/QA3/x.docx")).toEqual({ tree: "centre", category: "procedure", centreFolder: "Amana OSHC - Minaret Doveton", skip: false });
    expect(classifyPath("Shared Documents/SOPs/Amana OSHC AUDIT/QA 2/x.docx").skip).toBe(true);
    expect(classifyPath("Shared Documents/SOPs/Amana OSHC AUDIT 2026/QA 2/x.docx").skip).toBe(true);
    expect(classifyPath("Shared Documents/SOPs/Amana HR Management Review Audit/x.docx").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Employment Contract - J Smith.docx").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/WWCC - J Smith.pdf").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Contractor Induction Procedure.docx").skip).toBe(false); // \bcontracts?\b, not "contractor"
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/menu.png").skip).toBe(true);
    expect(classifyPath("Random/other.docx").skip).toBe(true);
  });

  it("tests PII words against the FULL path — a PII folder skips whatever its files are called", () => {
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Staff Contracts/roster.docx").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/WWCC/J Smith.pdf").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Staff Files/x.docx").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Personnel/QA7 Something.docx").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Working With Children/list.docx").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Employee Records/x.pdf").skip).toBe(true);
    expect(classifyPath("Shared Documents/SOPs/Jayden full SOP/Police Certificate Procedure.docx").skip).toBe(true);
    // A clean folder with a clean file still imports
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/QA2/Sun Safety Procedure.docx").skip).toBe(false);
  });

  it("allowlists .doc/.docx/.pdf on the basename and skips every other extension", () => {
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Arrival Notes.doc").skip).toBe(false);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Arrival Notes.DOCX").skip).toBe(false);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Arrival Notes.PDF").skip).toBe(false);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Arrival Notes.msg").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Arrival Notes.txt").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Arrival Notes.xlsx").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Arrival Notes.pptx").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Arrival Notes").skip).toBe(true);
    // The extension rule is on the basename only — ".pdf" inside a folder name does not admit a .msg
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/things.pdf/note.msg").skip).toBe(true);
  });

  it("skips staff-compliance scans case-insensitively (Visa, WWCC, police check)", () => {
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Visa - J Smith.pdf").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/j smith VISA grant.pdf").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/wwcc check.pdf").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Police Check - J Smith.pdf").skip).toBe(true);
    // \bvisa\b — "Visitor" / "advisable" style substrings do not trip it
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Visitor Sign In Procedure.docx").skip).toBe(false);
  });

  it("falls back to the filename category when the policy-library subfolder is neither Policies nor Procedures", () => {
    expect(classifyPath("Shared Documents/NSW & VIC state policies/Forms/Incident Policy Attachment.docx").category).toBe("policy");
    expect(classifyPath("Shared Documents/NSW & VIC state policies/Forms/Some Guide.docx").category).toBe("guide");
    // Centre folders: policy stays policy, everything else is a procedure
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/QA2 Sun Safety Policy.docx").category).toBe("policy");
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Arrival Notes.docx").category).toBe("procedure");
  });
});

describe("matchServiceByFolder", () => {
  const services = [{ id: "s1", name: "Amana OSHC Minaret Doveton" }, { id: "s2", name: "Amana OSHC Unity Grammar" }];
  it("matches on normalised name containment and returns null otherwise", () => {
    expect(matchServiceByFolder("Amana OSHC - Minaret Doveton", services)).toBe("s1");
    expect(matchServiceByFolder("Minaret Doveton", services)).toBe("s1");
    expect(matchServiceByFolder("Amana OSHC - Somewhere Else", services)).toBeNull();
  });

  it("matches a folder that CONTAINS the single fitting service name", () => {
    expect(matchServiceByFolder("Amana OSHC - Minaret Doveton Campus", services)).toBe("s1");
  });

  it("prefers an exact normalised match over containment across similarly named centres", () => {
    const similar = [{ id: "m1", name: "Amana OSHC Minaret" }, { id: "m2", name: "Amana OSHC Minaret Doveton" }];
    expect(matchServiceByFolder("Amana OSHC - Minaret Doveton", similar)).toBe("m2");
    expect(matchServiceByFolder("Amana OSHC - Minaret", similar)).toBe("m1");
  });

  it("returns null when containment would match more than one service (ambiguous)", () => {
    const similar = [{ id: "m1", name: "Amana OSHC Minaret" }, { id: "m2", name: "Amana OSHC Minaret Doveton" }];
    expect(matchServiceByFolder("Amana OSHC - Minaret Doveton Campus", similar)).toBeNull();
    expect(matchServiceByFolder("", similar)).toBeNull();
  });

  it("containment is token-bounded — 'hub' does not match 'hubert street'", () => {
    const hub = [{ id: "h1", name: "Amana OSHC Hub" }];
    expect(matchServiceByFolder("Amana OSHC - Hubert Street", hub)).toBeNull();
    expect(matchServiceByFolder("Amana OSHC - The Hub", hub)).toBe("h1");
    const hubert = [{ id: "h2", name: "Amana OSHC Hubert Street" }];
    expect(matchServiceByFolder("Amana OSHC - Hub", hubert)).toBeNull();
  });
});

describe("parseExportFile", () => {
  it("reads frontmatter + body", () => {
    const f = parseExportFile("---\nid: 1\nname: A.docx\nwebUrl: https://x/A.docx\npath: P/A.docx\nlastModified: 2026-01-01T00:00:00.000Z\n---\n# A\n\nbody");
    expect(f).toEqual({ id: "1", name: "A.docx", webUrl: "https://x/A.docx", path: "P/A.docx", lastModified: "2026-01-01T00:00:00.000Z", text: "# A\n\nbody" });
  });

  it("keeps colons inside values and rejects missing keys", () => {
    const f = parseExportFile("---\nid: 1\nname: A.docx\nwebUrl: https://x/A.docx\npath: P/A.docx\nlastModified: 2026-01-01T00:00:00.000Z\n---\nbody");
    expect(f.webUrl).toBe("https://x/A.docx");
    expect(() => parseExportFile("---\nid: 1\nname: A.docx\n---\nbody")).toThrow(/Missing frontmatter key: webUrl/);
    expect(() => parseExportFile("no frontmatter")).toThrow(/Missing frontmatter/);
  });

  it("strips a leading BOM and normalises CRLF line endings", () => {
    const crlf = "\uFEFF---\r\nid: 1\r\nname: A.docx\r\nwebUrl: https://x/A.docx\r\npath: P/A.docx\r\nlastModified: 2026-01-01T00:00:00.000Z\r\n---\r\n# A\r\n\r\nbody\r\n";
    const f = parseExportFile(crlf);
    expect(f).toEqual({ id: "1", name: "A.docx", webUrl: "https://x/A.docx", path: "P/A.docx", lastModified: "2026-01-01T00:00:00.000Z", text: "# A\n\nbody" });
  });
});

describe("listExportFiles", () => {
  it("walks recursively, keeps only .md and returns absolute paths sorted", async () => {
    const files = await listExportFiles(FIX);
    expect(files).toHaveLength(FIXTURE_IMPORTABLE + 1);
    expect(files.every((f) => f.endsWith(".md") && path.isAbsolute(f))).toBe(true);
    expect(files).toEqual([...files].sort());
  });
});

describe("importExportDir", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsert.mockImplementation(upsertCreated);
    prismaMock.service.findMany.mockResolvedValue([{ id: "s1", name: "Amana OSHC Minaret Doveton" }]);
    prismaMock.knowledgeSource.findMany.mockResolvedValue([]);
    prismaMock.knowledgeSource.updateMany.mockResolvedValue({ count: 1 });
  });

  it("imports the fixture tree with dedupe, conflict and skip outcomes", async () => {
    const report = await importExportDir(FIX);
    expect(report.counts).toEqual({ imported: FIXTURE_IMPORTABLE, unchanged: 0, superseded: 0, conflicts: 1, unmapped: 0, skipped: 1, errors: 0 });
    expect(upsert).toHaveBeenCalledTimes(FIXTURE_IMPORTABLE);
    const inputs = upsert.mock.calls.map((c) => c[0] as Record<string, unknown>);
    const rest3 = inputs.find((i) => String(i.title).includes("V3"));
    expect(rest3).toMatchObject({ sourceKind: "sharepoint", category: "procedure", state: null, serviceId: null });
    const sop = inputs.find((i) => String(i.title).startsWith("OPS-10"));
    expect(sop).toMatchObject({ category: "sop" });
    const centre = inputs.find((i) => String(i.title).startsWith("toilet"));
    expect(centre).toMatchObject({ serviceId: "s1", category: "procedure" });
    expect(report.files).toHaveLength(FIXTURE_IMPORTABLE);
    expect(report.files.find((f) => f.path.includes("toilet"))).toMatchObject({ tree: "centre", category: "procedure", serviceId: "s1", serviceName: "Amana OSHC Minaret Doveton" });
    expect(report.skipped[0].path).toContain("Amana OSHC AUDIT");
    expect(report.warnings).toEqual([]);
    // Nothing was excluded: every non-skipped file mapped cleanly
    expect(prismaMock.knowledgeSource.updateMany).not.toHaveBeenCalled();
    // Frontmatter paths match the on-disk paths, so no drift warning
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("reports ONE conflict per key listing every copy when three copies differ", async () => {
    const report = await importExportDir(FIX);
    expect(report.counts.conflicts).toBe(1);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]).toMatchObject({ normalizedTitle: "qa2 bushfire policy", state: "NSW", version: 11 });
    expect(report.conflicts[0].paths).toHaveLength(3);
    expect(report.conflicts[0].paths).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Reg 168 Policies and Procedures/Policies/QA2 Bushfire"),
        expect.stringContaining("NSW & VIC state policies/Policies/QA2 Bushfire"),
        expect.stringContaining("Jayden full SOP/6. Centre Operations/QA2 Bushfire"),
      ]),
    );
  });

  it("flags an unmapped centre folder, adapter-excludes its source via the active-only updateMany, and re-supersedes the org-wide group it had won", async () => {
    prismaMock.service.findMany.mockResolvedValue([]);
    const unmappedId = "src-01KJARKPZIKJUMSP2DTFALRIYQ3ELYWK06";
    // Unmapped ⇒ serviceId null ⇒ the centre copy shares the ORG-WIDE dedupe key. It won on
    // updatedAt, so the org-wide document is sitting `superseded` behind it.
    const orgWideKey = { normalizedTitle: "toilet supervision procedure", state: null, serviceId: null };
    prismaMock.knowledgeSource.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.id === unmappedId) return [orgWideKey]; // excludeSources' pre-flip key read
      if (where.normalizedTitle === orgWideKey.normalizedTitle) {
        return [{ id: "org-wide", version: null, status: "superseded", sourceKind: "sharepoint", updatedAt: new Date("2026-01-01") }];
      }
      return []; // the store-wide superseded total
    });
    const report = await importExportDir(FIX);
    expect(report.counts.unmapped).toBe(1);
    expect(report.unmapped[0]).toMatchObject({ centreFolder: "Amana OSHC - Minaret Doveton" });
    expect(prismaMock.knowledgeSource.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.knowledgeSource.updateMany).toHaveBeenCalledWith({
      where: { id: unmappedId, status: "active" },
      data: { status: "excluded", excludedBy: "adapter" },
    });
    // After the flip, supersession is re-run for the null-service key the excluded row belonged to...
    const passIdx = prismaMock.knowledgeSource.findMany.mock.calls.findIndex(
      (c: [{ where: Record<string, unknown> }]) => c[0].where.normalizedTitle === orgWideKey.normalizedTitle,
    );
    expect(passIdx).toBeGreaterThan(-1);
    expect(prismaMock.knowledgeSource.findMany.mock.calls[passIdx][0].where).toEqual({
      ...orgWideKey, status: { in: ["active", "superseded"] },
    });
    expect(prismaMock.knowledgeSource.findMany.mock.invocationCallOrder[passIdx])
      .toBeGreaterThan(prismaMock.knowledgeSource.updateMany.mock.invocationCallOrder[0]);
    // ...and the org-wide document comes back as the group's active winner instead of staying dark.
    expect(prismaMock.knowledgeSource.update).toHaveBeenCalledWith({
      where: { id: "org-wide" }, data: { status: "active", supersededById: null },
    });
    // The single Service is gone, so no service-scoped key clashes: still one conflict
    expect(report.counts.conflicts).toBe(1);
  });

  it("records upsert errors per file without aborting the run", async () => {
    upsert.mockImplementation(async (i) =>
      i.externalId.endsWith("05")
        ? { sourceId: `src-${i.externalId}`, outcome: "error", error: "embed failed" }
        : { sourceId: `src-${i.externalId}`, outcome: "created" },
    );
    const report = await importExportDir(FIX);
    expect(report.counts.errors).toBe(1);
    expect(report.counts.imported).toBe(FIXTURE_IMPORTABLE - 1);
    expect(report.errors[0]).toMatchObject({ error: "embed failed" });
    expect(report.errors[0].path).toContain("OPS-10");
  });

  it("reports the store-wide superseded total after the run", async () => {
    prismaMock.knowledgeSource.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const report = await importExportDir(FIX);
    expect(report.counts.superseded).toBe(2);
    expect(prismaMock.knowledgeSource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sourceKind: "sharepoint", status: "superseded" } }),
    );
  });

  it("logs progress at the end of the walk (and every 25 files)", async () => {
    await importExportDir(FIX);
    const progress = loggerMock.info.mock.calls.filter((c) => c[0] === "Knowledge: export import progress");
    expect(progress).toHaveLength(1);
    expect(progress[0][1]).toMatchObject({ done: FIXTURE_IMPORTABLE + 1, total: FIXTURE_IMPORTABLE + 1 });
  });

  describe("dry mode", () => {
    it("computes the same tally, conflicts and unmapped with NO upsert, exclusion or superseded query", async () => {
      prismaMock.service.findMany.mockResolvedValue([]);
      const report = await importExportDir(FIX, { dry: true });
      expect(report.counts).toEqual({ imported: FIXTURE_IMPORTABLE, unchanged: 0, superseded: 0, conflicts: 1, unmapped: 1, skipped: 1, errors: 0 });
      expect(report.files).toHaveLength(FIXTURE_IMPORTABLE);
      expect(report.conflicts[0].paths).toHaveLength(3);
      expect(report.unmapped[0]).toMatchObject({ centreFolder: "Amana OSHC - Minaret Doveton" });
      expect(upsert).not.toHaveBeenCalled();
      expect(prismaMock.knowledgeSource.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.knowledgeSource.update).not.toHaveBeenCalled();
      expect(prismaMock.knowledgeSource.findMany).not.toHaveBeenCalled();
      expect(report.warnings).toEqual([]);
    });

    it("degrades to all-unmapped with a warning when the Service lookup fails; a real run rethrows", async () => {
      // Prisma quotes the whole invocation; the warning keeps only the line that says what went wrong
      prismaMock.service.findMany.mockRejectedValue(new Error("\nInvalid `prisma.service.findMany()` invocation in\n/x.ts:1:1\n\n  1 try {\n→ 2   services = await prisma.service.findMany(\nCan't reach database server at `127.0.0.1:1`\n\nPlease make sure your database server is running at `127.0.0.1:1`."));
      const report = await importExportDir(FIX, { dry: true });
      expect(report.warnings).toHaveLength(1);
      expect(report.warnings[0]).toMatch(/^Service lookup failed \(Can't reach database server at `127\.0\.0\.1:1`\)/);
      expect(report.counts.unmapped).toBe(1);
      expect(upsert).not.toHaveBeenCalled();
      await expect(importExportDir(FIX)).rejects.toThrow(/Can't reach database server/);
    });
  });
});
