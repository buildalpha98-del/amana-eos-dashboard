import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const { upsert } = vi.hoisted(() => ({
  upsert: vi.fn(async (_input?: unknown) => ({ sourceId: "s", outcome: "created" })),
}));
vi.mock("@/lib/knowledge/pipeline", () => ({ upsertKnowledgeSource: (i: unknown) => upsert(i) }));
import { createManualSource, updateManualSource } from "@/lib/knowledge/adapters/manual";

describe("manual adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createManualSource mints externalId and defaults category", async () => {
    await createManualSource({ title: "Staff notice", text: "Body" });
    expect(upsert).toHaveBeenCalledTimes(1);
    const call = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toMatchObject({ sourceKind: "manual", title: "Staff notice", text: "Body", category: "guide" });
    expect(call.externalId).toMatch(/^manual:[0-9a-f-]{36}$/);
  });

  it("updateManualSource re-derives via upsert using the existing externalId + joined chunk text", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      sourceKind: "manual",
      externalId: "manual:abc123",
      title: "Old title",
      category: "guide",
      tier: "general",
      tierOverride: null,
      serviceId: null,
      state: null,
      externalUrl: null,
      chunks: [{ content: "Para one" }, { content: "Para two" }],
    });
    await updateManualSource("k1", { title: "New" });
    expect(prismaMock.knowledgeSource.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "k1" },
        select: expect.objectContaining({
          chunks: expect.objectContaining({ orderBy: { chunkIndex: "asc" } }),
        }),
      }),
    );
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      sourceKind: "manual",
      externalId: "manual:abc123",
      title: "New",
      text: "Para one\n\nPara two",
    });
  });

  it("rejects updating a non-manual source", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      sourceKind: "policy_upload",
      externalId: "v1",
      title: "T",
      category: "policy",
      tier: "general",
      tierOverride: null,
      serviceId: null,
      state: null,
      externalUrl: null,
      chunks: [],
    });
    await expect(updateManualSource("k1", { title: "New" })).rejects.toThrow(/Not a manual/);
    expect(upsert).not.toHaveBeenCalled();
  });
});
