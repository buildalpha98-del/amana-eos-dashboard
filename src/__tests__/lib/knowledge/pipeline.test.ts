import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const { embedTextsWithUsage } = vi.hoisted(() => ({
  embedTextsWithUsage: vi.fn(async (texts: string[]) => ({
    vectors: texts.map(() => [0.1, 0.2]),
    usage: { totalTokens: 10 },
  })),
}));
vi.mock("@/lib/embeddings", () => ({
  embedTextsWithUsage: (texts: string[]) => embedTextsWithUsage(texts),
  isEmbeddingsConfigured: vi.fn(() => true),
  toVectorLiteral: (v: number[]) => `[${v.join(",")}]`,
  EMBEDDING_MODEL: "voyage-3",
}));

import { upsertKnowledgeSource, applySupersession } from "@/lib/knowledge/pipeline";
import { hashContent } from "@/lib/knowledge/normalize";

const baseInput = {
  sourceKind: "sharepoint" as const,
  externalId: "sp-1",
  title: "QA2 Rest Time Procedure OSHC V3.docx",
  category: "procedure" as const,
  text: "# Rest time\n\nChildren rest after lunch.",
  state: "New South Wales",
};

/** What the DB already holds for baseInput — same title, same key. */
const storedRow = {
  id: "src-1",
  title: baseInput.title,
  normalizedTitle: "qa2 rest time procedure",
  state: "NSW",
  serviceId: null,
  excludedBy: null,
  indexError: null,
};

describe("upsertKnowledgeSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.knowledgeSource.findUnique.mockResolvedValue(null);
    prismaMock.knowledgeSource.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "src-1", ...data }));
    prismaMock.knowledgeSource.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "src-1", ...data }));
    prismaMock.knowledgeSource.findMany.mockResolvedValue([]);
    prismaMock.knowledgeChunk.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.knowledgeChunk.createMany.mockResolvedValue({ count: 1 });
    prismaMock.knowledgeChunk.findMany.mockResolvedValue([{ id: "c-1", chunkIndex: 0 }]);
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);
    prismaMock.aiUsage.create.mockResolvedValue({});
  });

  it("creates a source with derived fields and indexes it", async () => {
    const res = await upsertKnowledgeSource(baseInput);
    expect(res.outcome).toBe("created");
    const data = prismaMock.knowledgeSource.create.mock.calls[0][0].data;
    expect(data.normalizedTitle).toBe("qa2 rest time procedure");
    expect(data.state).toBe("NSW");
    expect(data.qualityArea).toBe(2);
    expect(data.version).toBe(3);
    expect(data.tier).toBe("safety_critical");
    expect(data.contentHash).toBe(hashContent(baseInput.text));
    expect(prismaMock.knowledgeChunk.createMany).toHaveBeenCalled();
    // tsvector + embedding writes
    const sql = prismaMock.$queryRawUnsafe.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sql.some((s: string) => s.includes("to_tsvector"))).toBe(true);
    expect(sql.some((s: string) => s.includes("::vector"))).toBe(true);
  });

  it("is unchanged (no re-chunk, no re-embed, no row write) when the hash AND title match", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      ...storedRow,
      contentHash: hashContent(baseInput.text),
      status: "active",
    });
    const res = await upsertKnowledgeSource(baseInput);
    expect(res.outcome).toBe("unchanged");
    expect(prismaMock.knowledgeSource.update).not.toHaveBeenCalled();
    expect(prismaMock.knowledgeChunk.createMany).not.toHaveBeenCalled();
    expect(prismaMock.knowledgeSource.findMany).not.toHaveBeenCalled(); // no supersession pass either
  });

  describe("rename with identical text (hash fast-path)", () => {
    const renamed = { ...baseInput, title: "QA2 Sleep and Rest Procedure OSHC V4.docx" };

    it("writes title/normalizedTitle + title-derived fields WITHOUT re-indexing, and reports 'updated'", async () => {
      prismaMock.knowledgeSource.findUnique.mockResolvedValue({
        ...storedRow,
        contentHash: hashContent(renamed.text),
        status: "active",
      });
      const res = await upsertKnowledgeSource(renamed);
      expect(res).toEqual({ sourceId: "src-1", outcome: "updated" });

      expect(prismaMock.knowledgeSource.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.knowledgeSource.update.mock.calls[0][0]).toEqual({
        where: { id: "src-1" },
        data: {
          title: renamed.title,
          normalizedTitle: "qa2 sleep and rest procedure",
          qualityArea: 2,
          version: 4,
          state: "NSW",
          tier: "safety_critical",
        },
      });
      // No chunk/embedding work at all — the text didn't change.
      expect(embedTextsWithUsage).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.knowledgeChunk.createMany).not.toHaveBeenCalled();
    });

    it("re-runs supersession for the OLD key and then the NEW key", async () => {
      prismaMock.knowledgeSource.findUnique.mockResolvedValue({
        ...storedRow,
        contentHash: hashContent(renamed.text),
        status: "active",
      });
      await upsertKnowledgeSource(renamed);
      const keys = prismaMock.knowledgeSource.findMany.mock.calls.map(
        (c: [{ where: { normalizedTitle: string; state: string | null; serviceId: string | null } }]) => c[0].where,
      );
      expect(keys).toEqual([
        expect.objectContaining({ normalizedTitle: "qa2 rest time procedure", state: "NSW", serviceId: null }),
        expect.objectContaining({ normalizedTitle: "qa2 sleep and rest procedure", state: "NSW", serviceId: null }),
      ]);
    });

    it("promotes the old group's superseded sibling once the renamed row has left it", async () => {
      prismaMock.knowledgeSource.findUnique.mockResolvedValue({
        ...storedRow,
        contentHash: hashContent(renamed.text),
        status: "active",
      });
      // Old group: only the sibling that src-1 had superseded remains.
      prismaMock.knowledgeSource.findMany.mockImplementation(async ({ where }: { where: { normalizedTitle: string } }) =>
        where.normalizedTitle === "qa2 rest time procedure"
          ? [{ id: "v2", version: 2, status: "superseded", sourceKind: "sharepoint", updatedAt: new Date("2026-01-01") }]
          : [],
      );
      await upsertKnowledgeSource(renamed);
      expect(prismaMock.knowledgeSource.update).toHaveBeenCalledWith({
        where: { id: "v2" },
        data: { status: "active", supersededById: null },
      });
    });

    it("a rename that keeps the same dedupe key runs supersession once", async () => {
      // "V3" → "V5": normalizeTitle strips the version token, so the key is unchanged.
      const bumped = { ...baseInput, title: "QA2 Rest Time Procedure OSHC V5.docx" };
      prismaMock.knowledgeSource.findUnique.mockResolvedValue({
        ...storedRow,
        contentHash: hashContent(bumped.text),
        status: "active",
      });
      const res = await upsertKnowledgeSource(bumped);
      expect(res.outcome).toBe("updated");
      expect(prismaMock.knowledgeSource.update.mock.calls[0][0].data).toMatchObject({ title: bumped.title, version: 5 });
      expect(prismaMock.knowledgeSource.findMany).toHaveBeenCalledTimes(1);
    });
  });

  it("full re-index path revisits the OLD key when the text AND the title change", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      ...storedRow,
      contentHash: "stale",
      status: "active",
    });
    const res = await upsertKnowledgeSource({ ...baseInput, title: "QA2 Sleep and Rest Procedure OSHC V4.docx" });
    expect(res.outcome).toBe("updated");
    expect(prismaMock.knowledgeChunk.createMany).toHaveBeenCalled();
    const keys = prismaMock.knowledgeSource.findMany.mock.calls.map(
      (c: [{ where: { normalizedTitle: string } }]) => c[0].where.normalizedTitle,
    );
    expect(keys).toEqual(["qa2 rest time procedure", "qa2 sleep and rest procedure"]);
  });

  it("full re-index path with an unchanged key runs supersession once (never for a phantom old key)", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({ ...storedRow, contentHash: "stale", status: "active" });
    await upsertKnowledgeSource(baseInput);
    expect(prismaMock.knowledgeSource.findMany).toHaveBeenCalledTimes(1);
  });

  it("records indexError and returns 'error' when chunking yields nothing", async () => {
    const res = await upsertKnowledgeSource({ ...baseInput, text: "   " });
    expect(res.outcome).toBe("error");
    const upd = prismaMock.knowledgeSource.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { indexError?: string } }).data.indexError,
    );
    expect(upd).toBeTruthy();
  });

  it("honours an explicit tier from the adapter", async () => {
    await upsertKnowledgeSource({ ...baseInput, tier: "general" });
    expect(prismaMock.knowledgeSource.create.mock.calls[0][0].data.tier).toBe("general");
  });

  it("re-activates an adapter-excluded source when its origin comes back (unchanged hash)", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      ...storedRow, contentHash: hashContent(baseInput.text), status: "excluded", excludedBy: "adapter",
    });
    const res = await upsertKnowledgeSource(baseInput);
    expect(res.outcome).toBe("updated");
    // Same title → ONLY the status flip is written, no title fields.
    expect(prismaMock.knowledgeSource.update.mock.calls[0][0]).toEqual({
      where: { id: "src-1" }, data: { status: "active", excludedBy: null },
    });
    expect(prismaMock.knowledgeChunk.createMany).not.toHaveBeenCalled();
  });

  it("never re-activates an admin-excluded source", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      ...storedRow, contentHash: "stale", status: "excluded", excludedBy: "admin",
    });
    const res = await upsertKnowledgeSource(baseInput);
    expect(res.outcome).toBe("updated");
    const data = prismaMock.knowledgeSource.update.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.excludedBy).toBeUndefined();
  });

  it("re-indexes a row whose hash matches but has a stale indexError", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      ...storedRow, contentHash: hashContent(baseInput.text), status: "active", indexError: "boom",
    });
    const res = await upsertKnowledgeSource(baseInput);
    expect(res.outcome).toBe("updated");
    expect(prismaMock.knowledgeChunk.createMany).toHaveBeenCalled();
  });

  it("passes an explicit timeout/maxWait to the indexing transaction", async () => {
    await upsertKnowledgeSource(baseInput);
    expect(prismaMock.$transaction.mock.calls[0][1]).toEqual({ timeout: 30_000, maxWait: 5_000 });
  });
});

describe("excludeSources", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adapter exclude touches active rows only (never an admin-excluded row)", async () => {
    prismaMock.knowledgeSource.updateMany.mockResolvedValue({ count: 2 });
    const { excludeSources } = await import("@/lib/knowledge/pipeline");
    await excludeSources({ sourceKind: "lms_module", externalId: { in: ["a", "b"] } }, "adapter");
    expect(prismaMock.knowledgeSource.updateMany.mock.calls[0][0]).toEqual({
      where: { sourceKind: "lms_module", externalId: { in: ["a", "b"] }, status: "active" },
      data: { status: "excluded", excludedBy: "adapter" },
    });
  });
  it("admin exclude may override an adapter exclusion but never a superseded row", async () => {
    prismaMock.knowledgeSource.updateMany.mockResolvedValue({ count: 1 });
    const { excludeSources } = await import("@/lib/knowledge/pipeline");
    await excludeSources({ id: "x" }, "admin");
    expect(prismaMock.knowledgeSource.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "x", status: { not: "superseded" } },
      data: { status: "excluded", excludedBy: "admin" },
    });
  });
});

describe("applySupersession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the highest version active within (normalizedTitle,state,serviceId) and marks the rest superseded", async () => {
    prismaMock.knowledgeSource.findMany.mockResolvedValue([
      { id: "v2", version: 2, status: "active", sourceKind: "sharepoint", updatedAt: new Date("2026-01-02") },
      { id: "v3", version: 3, status: "active", sourceKind: "sharepoint", updatedAt: new Date("2026-01-03") },
      { id: "vnull", version: null, status: "active", sourceKind: "sharepoint", updatedAt: new Date("2026-01-01") },
    ]);
    prismaMock.knowledgeSource.updateMany.mockResolvedValue({ count: 2 });
    const winner = await applySupersession({ normalizedTitle: "x", state: null, serviceId: null });
    expect(winner).toBe("v3");
    const call = prismaMock.knowledgeSource.updateMany.mock.calls[0][0];
    expect(call.where.id.in.sort()).toEqual(["v2", "vnull"]);
    expect(call.data).toEqual({ status: "superseded", supersededById: "v3" });
  });

  it("policy_upload always wins over sharepoint regardless of version", async () => {
    prismaMock.knowledgeSource.findMany.mockResolvedValue([
      { id: "sp", version: 9, status: "active", sourceKind: "sharepoint", updatedAt: new Date("2026-01-01") },
      { id: "pdf", version: 1, status: "active", sourceKind: "policy_upload", updatedAt: new Date("2026-01-01") },
    ]);
    prismaMock.knowledgeSource.updateMany.mockResolvedValue({ count: 1 });
    expect(await applySupersession({ normalizedTitle: "x", state: null, serviceId: null })).toBe("pdf");
  });

  it("a group whose active winner has gone promotes its best superseded row (and returns null for an empty group)", async () => {
    prismaMock.knowledgeSource.findMany.mockResolvedValue([
      { id: "v2", version: 2, status: "superseded", sourceKind: "sharepoint", updatedAt: new Date("2026-01-02") },
      { id: "v1", version: 1, status: "superseded", sourceKind: "sharepoint", updatedAt: new Date("2026-01-01") },
    ]);
    prismaMock.knowledgeSource.updateMany.mockResolvedValue({ count: 1 });
    expect(await applySupersession({ normalizedTitle: "x", state: null, serviceId: null })).toBe("v2");
    expect(prismaMock.knowledgeSource.update).toHaveBeenCalledWith({
      where: { id: "v2" }, data: { status: "active", supersededById: null },
    });
    // v1 is re-pointed at the NEW winner, not left pointing at the departed one.
    expect(prismaMock.knowledgeSource.updateMany.mock.calls[0][0]).toEqual({
      where: { id: { in: ["v1"] } }, data: { status: "superseded", supersededById: "v2" },
    });

    vi.clearAllMocks();
    prismaMock.knowledgeSource.findMany.mockResolvedValue([]);
    expect(await applySupersession({ normalizedTitle: "x", state: null, serviceId: null })).toBeNull();
    expect(prismaMock.knowledgeSource.update).not.toHaveBeenCalled();
    expect(prismaMock.knowledgeSource.updateMany).not.toHaveBeenCalled();
  });

  it("same kind, same version: the more recently updated row wins", async () => {
    prismaMock.knowledgeSource.findMany.mockResolvedValue([
      { id: "old", version: 2, status: "active", sourceKind: "sharepoint", updatedAt: new Date("2026-01-01") },
      { id: "new", version: 2, status: "active", sourceKind: "sharepoint", updatedAt: new Date("2026-02-01") },
    ]);
    prismaMock.knowledgeSource.updateMany.mockResolvedValue({ count: 1 });
    const winner = await applySupersession({ normalizedTitle: "x", state: null, serviceId: null });
    expect(winner).toBe("new");
    expect(prismaMock.knowledgeSource.updateMany.mock.calls[0][0]).toEqual({
      where: { id: { in: ["old"] } },
      data: { status: "superseded", supersededById: "new" },
    });
  });
});
