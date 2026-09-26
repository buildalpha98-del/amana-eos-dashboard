import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "../../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { upsert, exclude } = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({ sourceId: "s", outcome: "created" })),
  exclude: vi.fn(async () => 0),
}));
vi.mock("@/lib/knowledge/pipeline", () => ({ upsertKnowledgeSource: (i: unknown) => upsert(i), excludeSources: (...a: unknown[]) => exclude(...a) }));
vi.mock("@/lib/document-indexer", () => ({ extractTextFromBuffer: vi.fn(async () => "# Policy\n\nText") }));
import { syncPolicyVersion, excludePolicySources } from "@/lib/knowledge/adapters/policy-upload";

describe("policy_upload adapter", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as unknown as typeof fetch;
    prismaMock.policyDocumentVersion.findUnique.mockResolvedValue({
      id: "v1", versionNumber: 4, fileUrl: "https://blob/x.pdf",
      document: { id: "d1", title: "QA2 Medical Conditions Policy", category: "policy", isArchived: false },
    });
  });
  afterEach(() => { global.fetch = realFetch; });

  it("extracts the PDF and upserts with version + /policies link", async () => {
    await syncPolicyVersion("v1");
    expect(upsert.mock.calls[0][0]).toMatchObject({
      sourceKind: "policy_upload", externalId: "v1", version: 4, category: "policy",
      externalUrl: "/policies/d1", title: "QA2 Medical Conditions Policy", text: "# Policy\n\nText",
    });
  });

  it("does nothing for an archived policy and returns null", async () => {
    prismaMock.policyDocumentVersion.findUnique.mockResolvedValue({
      id: "v1", versionNumber: 1, fileUrl: "u", document: { id: "d1", title: "T", category: "other", isArchived: true },
    });
    expect(await syncPolicyVersion("v1")).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("excludePolicySources adapter-excludes every version source of the policy", async () => {
    prismaMock.policyDocumentVersion.findMany.mockResolvedValue([{ id: "v1" }, { id: "v2" }]);
    await excludePolicySources("d1");
    expect(exclude).toHaveBeenCalledWith(
      { sourceKind: "policy_upload", externalId: { in: ["v1", "v2"] } },
      "adapter",
    );
  });
});
