import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/embeddings", () => ({
  embedTextsWithUsage: vi.fn(async (texts: string[]) => ({
    vectors: texts.map(() => [0.1, 0.2]),
    usage: { totalTokens: 10 },
  })),
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

  it("is unchanged (no re-chunk, no re-embed) when the hash matches", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      id: "src-1",
      contentHash: hashContent(baseInput.text),
      status: "active",
    });
    const res = await upsertKnowledgeSource(baseInput);
    expect(res.outcome).toBe("unchanged");
    expect(prismaMock.knowledgeChunk.createMany).not.toHaveBeenCalled();
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
      id: "src-1", contentHash: hashContent(baseInput.text), status: "excluded", excludedBy: "adapter",
    });
    const res = await upsertKnowledgeSource(baseInput);
    expect(res.outcome).toBe("updated");
    expect(prismaMock.knowledgeSource.update.mock.calls[0][0]).toMatchObject({
      where: { id: "src-1" }, data: { status: "active", excludedBy: null },
    });
    expect(prismaMock.knowledgeChunk.createMany).not.toHaveBeenCalled();
  });

  it("never re-activates an admin-excluded source", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      id: "src-1", contentHash: "stale", status: "excluded", excludedBy: "admin",
    });
    const res = await upsertKnowledgeSource(baseInput);
    expect(res.outcome).toBe("updated");
    const data = prismaMock.knowledgeSource.update.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.excludedBy).toBeUndefined();
  });

  it("re-indexes a row whose hash matches but has a stale indexError", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      id: "src-1", contentHash: hashContent(baseInput.text), status: "active", indexError: "boom",
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
