import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const { upsert } = vi.hoisted(() => ({
  upsert: vi.fn(async (_input?: unknown) => ({ sourceId: "s", outcome: "created" })),
}));
vi.mock("@/lib/knowledge/pipeline", () => ({ upsertKnowledgeSource: (i: unknown) => upsert(i) }));
import { createManualSource, inferCategory, updateManualSource, uploadExternalId } from "@/lib/knowledge/adapters/manual";

describe("manual adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createManualSource mints externalId and defaults category", async () => {
    await createManualSource({ title: "Staff notice", text: "Body" });
    expect(upsert).toHaveBeenCalledTimes(1);
    const call = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toMatchObject({ sourceKind: "manual", title: "Staff notice", text: "Body", category: "guide" });
    expect(call.externalId).toMatch(/^manual:[0-9a-f-]{36}$/);
  });

  it("createManualSource uses a supplied externalId verbatim (the upload idempotency key)", async () => {
    await createManualSource({ title: "Policy", text: "Body", externalId: "manual:upload:/ai-knowledge/policy-abc.pdf" });
    expect(upsert.mock.calls[0][0]).toMatchObject({ sourceKind: "manual", externalId: "manual:upload:/ai-knowledge/policy-abc.pdf" });
  });

  it("uploadExternalId is deterministic per blob and identical for the pathname-vs-URL forms", () => {
    const url = "https://abc123.public.blob.vercel-storage.com/ai-knowledge/QA2%20Policy-XyZ.pdf?download=1";
    expect(uploadExternalId(url)).toBe("manual:upload:/ai-knowledge/QA2%20Policy-XyZ.pdf");
    expect(uploadExternalId(url)).toBe(uploadExternalId(url.replace("?download=1", "")));
    expect(uploadExternalId(url)).not.toBe(uploadExternalId(url.replace("XyZ", "AbC")));
  });

  it("updateManualSource re-derives via upsert using the existing externalId + joined chunk text", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      sourceKind: "manual",
      externalId: "manual:abc123",
      title: "Old title",
      category: "guide",
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
    // No tier is forwarded: the heuristic re-derives in the pipeline and the
    // admin's tierOverride is not part of the upsert's write set.
    expect(upsert.mock.calls[0][0]).not.toHaveProperty("tier");
  });

  describe("inferCategory", () => {
    it("sniffs policy / procedure from the filename, whole words only", () => {
      expect(inferCategory("QA2 Sun Safety Policy.pdf")).toBe("policy");
      expect(inferCategory("qa7 governance policies v3.docx")).toBe("policy");
      expect(inferCategory("Medication Procedure.pdf")).toBe("procedure");
      expect(inferCategory("Emergency procedures.docx")).toBe("procedure");
      expect(inferCategory("Policyholder notes.pdf")).toBe("guide");
    });

    it("also reads the admin's title, with policy beating procedure", () => {
      expect(inferCategory("scan-0042.pdf", "Sun Safety Policy")).toBe("policy");
      expect(inferCategory("Handwashing procedure.pdf", "Hygiene Policy")).toBe("policy");
    });

    it("falls back to guide", () => {
      expect(inferCategory("Employee Handbook.pdf")).toBe("guide");
      expect(inferCategory("notes.txt", "")).toBe("guide");
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
