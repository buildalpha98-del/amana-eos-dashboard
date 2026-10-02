import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "../../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { upsert, exclude } = vi.hoisted(() => ({
  upsert: vi.fn(async (_input?: unknown) => ({ sourceId: "s", outcome: "created" })),
  exclude: vi.fn(async (..._args: unknown[]) => 0),
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

  it("bounds the Blob fetch with a 30 s timeout signal", async () => {
    await syncPolicyVersion("v1");
    const [url, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe("https://blob/x.pdf");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("a fetch that throws (timeout / socket reset) fails THIS policy, never the whole backfill", async () => {
    global.fetch = vi.fn(async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }) as unknown as typeof fetch;
    const result = await syncPolicyVersion("v1");
    expect(result).toEqual({
      sourceId: "",
      outcome: "error",
      error: "download failed: The operation was aborted due to timeout — QA2 Medical Conditions Policy (version 4)",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a PDF whose declared Content-Length exceeds the cap without reading the body", async () => {
    const arrayBuffer = vi.fn();
    global.fetch = vi.fn(async () => ({
      ok: true, status: 200,
      headers: new Headers({ "content-length": String(26 * 1024 * 1024) }),
      arrayBuffer,
    })) as unknown as typeof fetch;
    const result = await syncPolicyVersion("v1");
    expect(result).toMatchObject({ outcome: "error", error: expect.stringMatching(/^too large \(declared 27262976 bytes\)/) });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a body that turns out larger than the cap when Content-Length was missing", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true, status: 200,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(25 * 1024 * 1024 + 1),
    })) as unknown as typeof fetch;
    const result = await syncPolicyVersion("v1");
    expect(result).toMatchObject({ outcome: "error", error: expect.stringMatching(/^too large \(26214401 bytes\)/) });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("download failure returns an identifiable error (title + version)", async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    const result = await syncPolicyVersion("v1");
    expect(result).toEqual({
      sourceId: "",
      outcome: "error",
      error: "download 500 — QA2 Medical Conditions Policy (version 4)",
    });
    expect(upsert).not.toHaveBeenCalled();
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
