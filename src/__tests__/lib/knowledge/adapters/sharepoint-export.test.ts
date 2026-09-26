import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import { prismaMock } from "../../../helpers/prisma-mock";
import type { UpsertResult } from "@/lib/knowledge/types";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { upsert, upsertCreated } = vi.hoisted(() => {
  const upsertCreated = async (i: { externalId: string }): Promise<UpsertResult> => ({ sourceId: `src-${i.externalId}`, outcome: "created" });
  return { upsertCreated, upsert: vi.fn<(i: { externalId: string }) => Promise<UpsertResult>>(upsertCreated) };
});
vi.mock("@/lib/knowledge/pipeline", () => ({ upsertKnowledgeSource: (i: unknown) => upsert(i as { externalId: string }) }));

import { classifyPath, matchServiceByFolder, parseExportFile, importExportDir } from "@/lib/knowledge/adapters/sharepoint-export";

const FIX = path.join(process.cwd(), "src/__tests__/fixtures/knowledge-export");

describe("classifyPath", () => {
  it("maps each tree to category + scope", () => {
    expect(classifyPath("NSW Schools/Amana OSHC - NSW Service Approval - Reg 168 Policies and Procedures/Policies/x.docx")).toEqual({ tree: "reg168", category: "policy", centreFolder: null, skip: false });
    expect(classifyPath("Shared Documents/NSW & VIC state policies/Procedures/x.docx")).toEqual({ tree: "state", category: "procedure", centreFolder: null, skip: false });
    expect(classifyPath("Shared Documents/SOPs/Jayden full SOP/6. Centre Operations/OPS-10.docx")).toEqual({ tree: "sop", category: "sop", centreFolder: null, skip: false });
    expect(classifyPath("Melbourne Schools/Amana OSHC - Minaret Doveton/QA3/x.docx")).toEqual({ tree: "centre", category: "procedure", centreFolder: "Amana OSHC - Minaret Doveton", skip: false });
    expect(classifyPath("Shared Documents/SOPs/Amana OSHC AUDIT/QA 2/x.docx").skip).toBe(true);
    expect(classifyPath("Shared Documents/SOPs/Amana HR Management Review Audit/x.docx").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Employment Contract - J Smith.docx").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/WWCC - J Smith.pdf").skip).toBe(true);
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/Contractor Induction Procedure.docx").skip).toBe(false); // \bcontracts?\b, not "contractor"
    expect(classifyPath("NSW Schools/Amana OSHC - Foo/menu.png").skip).toBe(true);
    expect(classifyPath("Random/other.docx").skip).toBe(true);
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
});

describe("importExportDir", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsert.mockImplementation(upsertCreated);
    prismaMock.service.findMany.mockResolvedValue([{ id: "s1", name: "Amana OSHC Minaret Doveton" }]);
    prismaMock.knowledgeSource.findMany.mockResolvedValue([]);
    prismaMock.knowledgeSource.update.mockResolvedValue({});
  });

  it("imports the fixture tree with dedupe, conflict and skip outcomes", async () => {
    const report = await importExportDir(FIX);
    expect(report.counts).toEqual({ imported: 6, unchanged: 0, superseded: 0, conflicts: 1, unmapped: 0, skipped: 1, errors: 0 });
    const inputs = upsert.mock.calls.map((c) => c[0] as Record<string, unknown>);
    const rest3 = inputs.find((i) => String(i.title).includes("V3"));
    expect(rest3).toMatchObject({ sourceKind: "sharepoint", category: "procedure", state: null, serviceId: null });
    const sop = inputs.find((i) => String(i.title).startsWith("OPS-10"));
    expect(sop).toMatchObject({ category: "sop" });
    const centre = inputs.find((i) => String(i.title).startsWith("toilet"));
    expect(centre).toMatchObject({ serviceId: "s1", category: "procedure" });
    expect(report.conflicts[0]).toMatchObject({ normalizedTitle: "qa2 bushfire policy", state: "NSW" });
    expect(report.conflicts[0].paths).toHaveLength(2);
    expect(report.skipped[0].path).toContain("Amana OSHC AUDIT");
    // Nothing was excluded: every non-skipped file mapped cleanly
    expect(prismaMock.knowledgeSource.update).not.toHaveBeenCalled();
  });

  it("flags an unmapped centre folder and excludes its source", async () => {
    prismaMock.service.findMany.mockResolvedValue([]);
    const report = await importExportDir(FIX);
    expect(report.counts.unmapped).toBe(1);
    expect(report.unmapped[0]).toMatchObject({ centreFolder: "Amana OSHC - Minaret Doveton" });
    const excluded = prismaMock.knowledgeSource.update.mock.calls.find((c: unknown[]) => (c[0] as { data: { status?: string } }).data.status === "excluded");
    expect(excluded).toBeTruthy();
    expect((excluded![0] as { data: { excludedBy?: string } }).data.excludedBy).toBe("adapter");
  });

  it("records upsert errors per file without aborting the run", async () => {
    upsert.mockImplementation(async (i) =>
      i.externalId.endsWith("05")
        ? { sourceId: `src-${i.externalId}`, outcome: "error", error: "embed failed" }
        : { sourceId: `src-${i.externalId}`, outcome: "created" },
    );
    const report = await importExportDir(FIX);
    expect(report.counts.errors).toBe(1);
    expect(report.counts.imported).toBe(5);
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
});
