import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 59, resetIn: 60000 })) }));
const { logger } = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({ logger, generateRequestId: () => "t" }));
const { createManual, updateManual, runAdapter, indexSource, applySupersession, deleteFile, extractText } = vi.hoisted(() => ({
  createManual: vi.fn(async (_i?: unknown): Promise<{ sourceId: string; outcome: string; error?: string }> => ({ sourceId: "k1", outcome: "created" })),
  updateManual: vi.fn(async (..._a: unknown[]) => ({ sourceId: "k1", outcome: "updated" })),
  runAdapter: vi.fn(async (..._a: unknown[]) => ({ id: "run1", counts: { created: 1 } })),
  indexSource: vi.fn(async (..._a: unknown[]) => ({ ok: true, chunks: 2 })),
  applySupersession: vi.fn(async (_key?: unknown) => null),
  deleteFile: vi.fn(async (_url?: string) => undefined),
  extractText: vi.fn(async (..._a: unknown[]) => "Extracted policy text"),
}));
// uploadExternalId is the real helper: the register test asserts the exact id it derives.
vi.mock("@/lib/knowledge/adapters/manual", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/knowledge/adapters/manual")>()),
  createManualSource: (i: unknown) => createManual(i),
  updateManualSource: (...a: unknown[]) => updateManual(...a),
}));
vi.mock("@/lib/knowledge/sync", () => ({ runAdapter: (...a: unknown[]) => runAdapter(...a), RUNNABLE_ADAPTERS: ["backfill", "regulator"] }));
vi.mock("@/lib/knowledge/pipeline", () => ({
  indexSource: (...a: unknown[]) => indexSource(...a),
  applySupersession: (k: unknown) => applySupersession(k),
  upsertKnowledgeSource: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({ deleteFile: (u: string) => deleteFile(u) }));
vi.mock("@/lib/document-indexer", () => ({ extractText: (...a: unknown[]) => extractText(...a) }));

import { GET, POST } from "@/app/api/settings/ai-knowledge/route";
import { GET as GET_ONE, PATCH, DELETE } from "@/app/api/settings/ai-knowledge/[id]/route";
import { POST as REINDEX } from "@/app/api/settings/ai-knowledge/[id]/reindex/route";
import { POST as REGISTER } from "@/app/api/settings/ai-knowledge/register/route";
import { POST as SYNC, GET as SYNC_RUNS } from "@/app/api/settings/ai-knowledge/sync/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const asOwner = () => mockSession({ id: "u", name: "O", role: "owner" });

/** The existence lookup the [id] routes make — the dedupe key rides along. */
const manualRow = {
  id: "k1", sourceKind: "manual", externalUrl: null, normalizedTitle: "roll call", state: "NSW", serviceId: null,
};
const manualKey = { normalizedTitle: "roll call", state: "NSW", serviceId: null };

const BLOB = "https://abc123.public.blob.vercel-storage.com/ai-knowledge/QA2%20Sun%20Safety%20Policy-x1y2.pdf";

describe("/api/settings/ai-knowledge", () => {
  beforeEach(() => { _clearUserActiveCache(); vi.clearAllMocks(); prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "owner" }); });

  it("401 without session", async () => {
    mockNoSession();
    expect((await GET(createRequest("GET", "/api/settings/ai-knowledge"))).status).toBe(401);
  });

  it("403 for staff", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "staff" });
    mockSession({ id: "u", name: "S", role: "staff" });
    expect((await GET(createRequest("GET", "/api/settings/ai-knowledge"))).status).toBe(403);
  });

  it("GET lists KnowledgeSource rows with chunk counts and service name", async () => {
    asOwner();
    prismaMock.knowledgeSource.findMany.mockResolvedValue([{
      id: "k1", title: "T", sourceKind: "manual", category: "guide", tier: "general", tierOverride: null, qualityArea: null,
      serviceId: "s1", service: { name: "Doveton" }, state: null, version: null, status: "active", excludedBy: null, externalUrl: null,
      indexedAt: null, indexError: null, embedded: false, createdAt: new Date(), updatedAt: new Date(), _count: { chunks: 3 },
    }]);
    const res = await GET(createRequest("GET", "/api/settings/ai-knowledge"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.entries[0]).toMatchObject({ id: "k1", chunkCount: 3, serviceName: "Doveton", embedded: false });
    expect(prismaMock.knowledgeSource.findMany.mock.calls[0][0].select).toMatchObject({ embedded: true, indexError: true });
    // The list never ships the full text.
    expect(prismaMock.knowledgeSource.findMany.mock.calls[0][0].select).not.toHaveProperty("text");
    expect(prismaMock.knowledgeSource.findMany.mock.calls[0][0].where).toBeUndefined();
  });

  describe("POST create", () => {
    it("validates and creates a manual source", async () => {
      asOwner();
      expect((await POST(createRequest("POST", "/api/settings/ai-knowledge", { body: { title: "" } }))).status).toBe(400);
      const res = await POST(createRequest("POST", "/api/settings/ai-knowledge", { body: { title: "Roll call", body: "# Roll call\n…", category: "sop" } }));
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: "k1", outcome: "created", error: null });
      expect(createManual.mock.calls[0][0]).toMatchObject({ title: "Roll call", text: "# Roll call\n…", category: "sop" });
      expect(createManual.mock.calls[0][0]).not.toHaveProperty("tier");
      expect(prismaMock.knowledgeSource.update).not.toHaveBeenCalled();
      expect(prismaMock.service.findUnique).not.toHaveBeenCalled();
    });

    it("an explicit tier is admin intent — lands in tierOverride, never the heuristic tier column", async () => {
      asOwner();
      const res = await POST(createRequest("POST", "/api/settings/ai-knowledge", { body: { title: "Roll call", body: "# Roll call\n…", tier: "safety_critical" } }));
      expect(res.status).toBe(201);
      expect(createManual.mock.calls[0][0]).not.toHaveProperty("tier");
      expect(prismaMock.knowledgeSource.update).toHaveBeenCalledWith({ where: { id: "k1" }, data: { tierOverride: "safety_critical" } });
    });

    it("a failed tierOverride stamp after a successful create still 201s, surfaces the failure, and logs it", async () => {
      asOwner();
      prismaMock.knowledgeSource.update.mockRejectedValueOnce(new Error("db down"));
      const res = await POST(createRequest("POST", "/api/settings/ai-knowledge", { body: { title: "Roll call", body: "# Roll call\n…", tier: "safety_critical" } }));
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.id).toBe("k1");
      expect(json.outcome).toBe("created");
      expect(json.error).toMatch(/tier/i);
      expect(logger.error).toHaveBeenCalledWith(
        "AI knowledge: tierOverride stamp failed after create",
        expect.objectContaining({ sourceId: "k1", actorId: "u" }),
      );
    });

    it("surfaces an indexing error in the body and warns, instead of a silent 201", async () => {
      asOwner();
      createManual.mockResolvedValueOnce({ sourceId: "k9", outcome: "error", error: "No text content extracted" });
      const res = await POST(createRequest("POST", "/api/settings/ai-knowledge", { body: { title: "Blank", body: "   " } }));
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: "k9", outcome: "error", error: "No text content extracted" });
      expect(logger.warn).toHaveBeenCalledWith(
        "AI knowledge: manual source created but not indexed",
        expect.objectContaining({ sourceId: "k9", actorId: "u", err: "No text content extracted" }),
      );
    });

    it("400s an unknown serviceId before creating anything; a known one passes through", async () => {
      asOwner();
      prismaMock.service.findUnique.mockResolvedValue(null);
      const res = await POST(createRequest("POST", "/api/settings/ai-knowledge", { body: { title: "T", body: "B", serviceId: "svc-nope" } }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Unknown serviceId");
      expect(createManual).not.toHaveBeenCalled();

      prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1" });
      expect((await POST(createRequest("POST", "/api/settings/ai-knowledge", { body: { title: "T", body: "B", serviceId: "svc-1" } }))).status).toBe(201);
      expect(prismaMock.service.findUnique).toHaveBeenLastCalledWith({ where: { id: "svc-1" }, select: { id: true } });
      expect(createManual.mock.calls[0][0]).toMatchObject({ serviceId: "svc-1" });
    });
  });

  it("GET [id] returns the entry with its PERSISTED text as body (never rejoined chunks); 404 unknown", async () => {
    asOwner();
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      id: "k1", title: "T", sourceKind: "manual", category: "guide", tier: "general", tierOverride: null, qualityArea: null,
      serviceId: null, service: null, state: null, version: null, status: "active", excludedBy: null, externalUrl: null,
      indexedAt: null, indexError: null, embedded: false, createdAt: new Date(), updatedAt: new Date(), _count: { chunks: 2 },
      text: "# Heading\n\nPara one\n\nPara two",
    });
    const res = await GET_ONE(createRequest("GET", "/x"), ctx("k1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ id: "k1", chunkCount: 2, serviceName: null, embedded: false, body: "# Heading\n\nPara one\n\nPara two" });
    expect(json.text).toBeUndefined();
    expect(json.chunks).toBeUndefined();
    const select = prismaMock.knowledgeSource.findUnique.mock.calls[0][0].select;
    expect(select.text).toBe(true);
    expect(select).not.toHaveProperty("chunks");

    prismaMock.knowledgeSource.findUnique.mockResolvedValue(null);
    expect((await GET_ONE(createRequest("GET", "/x"), ctx("nope"))).status).toBe(404);
  });

  describe("PATCH", () => {
    it("updates tierOverride/status for any kind; 409 on a content edit of an adapter-owned row; 404 unknown", async () => {
      asOwner();
      prismaMock.knowledgeSource.findUnique.mockResolvedValue({ ...manualRow, sourceKind: "sharepoint" });
      prismaMock.knowledgeSource.update.mockResolvedValue({});
      expect((await PATCH(createRequest("PATCH", "/x", { body: { body: "new" } }), ctx("k1"))).status).toBe(409); // not manual
      expect(updateManual).not.toHaveBeenCalled();
      expect((await PATCH(createRequest("PATCH", "/x", { body: { tierOverride: "safety_critical", status: "excluded" } }), ctx("k1"))).status).toBe(200);
      expect(prismaMock.knowledgeSource.update.mock.calls[0][0].data).toEqual({ tierOverride: "safety_critical", status: "excluded", excludedBy: "admin" });
      expect(logger.info).toHaveBeenCalledWith("AI knowledge: source updated", expect.objectContaining({ id: "k1", actorId: "u" }));
      prismaMock.knowledgeSource.findUnique.mockResolvedValue(null);
      expect((await PATCH(createRequest("PATCH", "/x", { body: { title: "t" } }), ctx("nope"))).status).toBe(404);
    });

    it("409s a body edit of an uploaded file (externalUrl set) but still allows a rename", async () => {
      asOwner();
      prismaMock.knowledgeSource.findUnique.mockResolvedValue({ ...manualRow, externalUrl: BLOB });
      expect((await PATCH(createRequest("PATCH", "/x", { body: { body: "new" } }), ctx("k1"))).status).toBe(409);
      expect(updateManual).not.toHaveBeenCalled();
      expect((await PATCH(createRequest("PATCH", "/x", { body: { title: "  Renamed  " } }), ctx("k1"))).status).toBe(200);
      expect(updateManual).toHaveBeenCalledWith("k1", { title: "Renamed", text: undefined });
    });

    it("status:'excluded' stamps excludedBy:'admin' and re-runs supersession for the row's key", async () => {
      asOwner();
      prismaMock.knowledgeSource.findUnique.mockResolvedValue(manualRow);
      prismaMock.knowledgeSource.update.mockResolvedValue({});
      expect((await PATCH(createRequest("PATCH", "/x", { body: { status: "excluded" } }), ctx("k1"))).status).toBe(200);
      expect(prismaMock.knowledgeSource.update.mock.calls[0][0]).toEqual({
        where: { id: "k1" }, data: { status: "excluded", excludedBy: "admin" },
      });
      expect(applySupersession).toHaveBeenCalledTimes(1);
      expect(applySupersession).toHaveBeenCalledWith(manualKey);
    });

    it("status:'active' clears excludedBy AND supersededById, then re-runs supersession", async () => {
      asOwner();
      prismaMock.knowledgeSource.findUnique.mockResolvedValue(manualRow);
      prismaMock.knowledgeSource.update.mockResolvedValue({});
      expect((await PATCH(createRequest("PATCH", "/x", { body: { status: "active" } }), ctx("k1"))).status).toBe(200);
      expect(prismaMock.knowledgeSource.update.mock.calls[0][0]).toEqual({
        where: { id: "k1" }, data: { status: "active", excludedBy: null, supersededById: null },
      });
      expect(applySupersession).toHaveBeenCalledWith(manualKey);
    });

    it("a tierOverride-only change writes the row but never touches supersession", async () => {
      asOwner();
      prismaMock.knowledgeSource.findUnique.mockResolvedValue(manualRow);
      prismaMock.knowledgeSource.update.mockResolvedValue({});
      expect((await PATCH(createRequest("PATCH", "/x", { body: { tierOverride: null } }), ctx("k1"))).status).toBe(200);
      expect(prismaMock.knowledgeSource.update.mock.calls[0][0].data).toEqual({ tierOverride: null });
      expect(applySupersession).not.toHaveBeenCalled();
    });
  });

  describe("DELETE", () => {
    it("deletes the blob + the row, re-runs supersession for the row's key, and logs the actor", async () => {
      asOwner();
      prismaMock.knowledgeSource.findUnique.mockResolvedValue({ ...manualRow, externalUrl: BLOB });
      prismaMock.knowledgeSource.delete.mockResolvedValue({});
      expect((await DELETE(createRequest("DELETE", "/x"), ctx("k1"))).status).toBe(200);
      expect(deleteFile).toHaveBeenCalledWith(BLOB);
      expect(prismaMock.knowledgeSource.delete).toHaveBeenCalledWith({ where: { id: "k1" } });
      expect(applySupersession).toHaveBeenCalledWith(manualKey);
      expect(logger.info).toHaveBeenCalledWith("AI knowledge: source deleted", expect.objectContaining({ id: "k1", actorId: "u" }));
    });

    it("still deletes the row (and warns) when the blob delete throws", async () => {
      asOwner();
      prismaMock.knowledgeSource.findUnique.mockResolvedValue({ ...manualRow, externalUrl: BLOB });
      prismaMock.knowledgeSource.delete.mockResolvedValue({});
      deleteFile.mockRejectedValueOnce(new Error("blob gone"));
      expect((await DELETE(createRequest("DELETE", "/x"), ctx("k1"))).status).toBe(200);
      expect(prismaMock.knowledgeSource.delete).toHaveBeenCalledWith({ where: { id: "k1" } });
      expect(applySupersession).toHaveBeenCalledWith(manualKey);
      expect(logger.warn).toHaveBeenCalledWith("AI knowledge: blob delete failed", expect.objectContaining({ id: "k1", err: "blob gone" }));
    });

    it("skips the blob call for a pasted entry and 409s an adapter-owned source", async () => {
      asOwner();
      prismaMock.knowledgeSource.findUnique.mockResolvedValue(manualRow);
      prismaMock.knowledgeSource.delete.mockResolvedValue({});
      expect((await DELETE(createRequest("DELETE", "/x"), ctx("k1"))).status).toBe(200);
      expect(deleteFile).not.toHaveBeenCalled();

      prismaMock.knowledgeSource.findUnique.mockResolvedValue({ ...manualRow, id: "k2", sourceKind: "policy_upload" });
      expect((await DELETE(createRequest("DELETE", "/x"), ctx("k2"))).status).toBe(409);
      expect(prismaMock.knowledgeSource.delete).toHaveBeenCalledTimes(1);
    });
  });

  it("POST [id]/reindex re-indexes from the PERSISTED text (never rejoined chunks); 404 unknown", async () => {
    asOwner();
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({ id: "k1", text: "# One\n\nTwo" });
    const res = await REINDEX(createRequest("POST", "/x"), ctx("k1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, chunks: 2 });
    expect(indexSource).toHaveBeenCalledWith("k1", "# One\n\nTwo");
    expect(prismaMock.knowledgeSource.findUnique.mock.calls[0][0].select).toEqual({ id: true, text: true });

    prismaMock.knowledgeSource.findUnique.mockResolvedValue(null);
    expect((await REINDEX(createRequest("POST", "/x"), ctx("nope"))).status).toBe(404);
  });

  describe("POST /register", () => {
    const body = { blobUrl: BLOB, fileName: "QA2 Sun Safety Policy.pdf", title: "Sun Safety Policy", mimeType: "application/pdf", fileSize: 1234 };

    it("extracts, categorises from the filename and creates the source under the deterministic upload id", async () => {
      asOwner();
      const res = await REGISTER(createRequest("POST", "/x", { body }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: "k1", outcome: "created", error: null });
      expect(extractText).toHaveBeenCalledWith(BLOB, "application/pdf");
      expect(createManual).toHaveBeenCalledWith({
        title: "Sun Safety Policy",
        text: "Extracted policy text",
        externalUrl: BLOB,
        externalId: "manual:upload:/ai-knowledge/QA2%20Sun%20Safety%20Policy-x1y2.pdf",
        category: "policy",
      });
      expect(prismaMock.knowledgeSource.findFirst).not.toHaveBeenCalled();
      expect(indexSource).not.toHaveBeenCalled();
    });

    it("is idempotent: a repeat call for the same blob derives the same externalId and passes the pipeline's 'unchanged' through", async () => {
      asOwner();
      await REGISTER(createRequest("POST", "/x", { body }));
      createManual.mockResolvedValueOnce({ sourceId: "k1", outcome: "unchanged" });
      const res = await REGISTER(createRequest("POST", "/x", { body }));
      expect(await res.json()).toEqual({ id: "k1", outcome: "unchanged", error: null });
      const ids = createManual.mock.calls.map((c) => (c[0] as { externalId: string }).externalId);
      expect(ids).toHaveLength(2);
      expect(ids[0]).toBe(ids[1]);
    });

    it("400s a URL that is not on the Blob host, without fetching it", async () => {
      asOwner();
      const res = await REGISTER(createRequest("POST", "/x", { body: { ...body, blobUrl: "https://evil.example.com/x.pdf" } }));
      expect(res.status).toBe(400);
      expect((await res.json()).details.blobUrl).toBeDefined();
      expect(extractText).not.toHaveBeenCalled();
      expect(createManual).not.toHaveBeenCalled();
    });

    it("short-circuits a zip (by extension or content type) — the upload webhook owns per-entry ingest", async () => {
      asOwner();
      const zipUrl = "https://abc123.public.blob.vercel-storage.com/ai-knowledge/Policies-x1y2.ZIP";
      const res = await REGISTER(createRequest("POST", "/x", { body: { ...body, blobUrl: zipUrl, fileName: "Policies.zip", mimeType: "application/octet-stream" } }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: null, outcome: "unchanged", error: null, reason: "zip entries are registered by the upload webhook" });

      const byType = await REGISTER(createRequest("POST", "/x", { body: { ...body, mimeType: "application/x-zip-compressed" } }));
      expect((await byType.json()).outcome).toBe("unchanged");

      expect(extractText).not.toHaveBeenCalled();
      expect(createManual).not.toHaveBeenCalled();
    });

    it("surfaces an indexing error from the pipeline", async () => {
      asOwner();
      createManual.mockResolvedValueOnce({ sourceId: "k1", outcome: "error", error: "No text content extracted" });
      const res = await REGISTER(createRequest("POST", "/x", { body }));
      expect(await res.json()).toEqual({ id: "k1", outcome: "error", error: "No text content extracted" });
      expect(logger.error).toHaveBeenCalledWith("AI knowledge register: indexing failed", expect.objectContaining({ sourceId: "k1" }));
    });

    it("when createManualSource throws (e.g. the credential guard), deletes the orphaned blob and still 400s with the message", async () => {
      asOwner();
      createManual.mockRejectedValueOnce(ApiError.badRequest("This document appears to contain a password or key — remove it before adding it to the knowledge store"));
      const res = await REGISTER(createRequest("POST", "/x", { body }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/password or key/i);
      expect(deleteFile).toHaveBeenCalledWith(BLOB);
    });

    it("a NON-credential throw (e.g. a DB error) still cleans up the blob — any throw orphans it, not just the credential guard", async () => {
      asOwner();
      createManual.mockRejectedValueOnce(new Error("db down"));
      const res = await REGISTER(createRequest("POST", "/x", { body }));
      expect(res.status).toBe(500);
      expect(deleteFile).toHaveBeenCalledWith(BLOB);
    });

    it("still 400s with the original error even when the blob deletion itself fails", async () => {
      asOwner();
      createManual.mockRejectedValueOnce(ApiError.badRequest("This document appears to contain a password or key — remove it before adding it to the knowledge store"));
      deleteFile.mockRejectedValueOnce(new Error("blob gone"));
      const res = await REGISTER(createRequest("POST", "/x", { body }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/password or key/i);
      expect(logger.warn).toHaveBeenCalledWith(
        "AI knowledge: blob cleanup failed after rejected upload",
        expect.objectContaining({ blobUrl: BLOB, err: "blob gone" }),
      );
    });
  });

  it("POST /sync runs a runnable adapter and rejects others", async () => {
    asOwner();
    prismaMock.knowledgeSyncRun.findFirst.mockResolvedValue(null);
    expect((await SYNC(createRequest("POST", "/x", { body: { adapter: "sharepoint" } }))).status).toBe(400);
    const res = await SYNC(createRequest("POST", "/x", { body: { adapter: "backfill" } }));
    expect(res.status).toBe(200);
    expect(runAdapter).toHaveBeenCalledWith("backfill", "u");
    // The open-run check is per adapter and ignores runs older than an hour (janitor closes those).
    const where = prismaMock.knowledgeSyncRun.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ adapter: "backfill", finishedAt: null });
    expect(Date.now() - where.startedAt.gt.getTime()).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000);
  });

  it("POST /sync 409s while a run for that adapter is still open (concurrent clicks) and never starts a second one", async () => {
    asOwner();
    prismaMock.knowledgeSyncRun.findFirst.mockResolvedValue({ id: "open1", startedAt: new Date("2026-09-27T01:00:00Z") });
    const res = await SYNC(createRequest("POST", "/x", { body: { adapter: "regulator" } }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/regulator sync started at 2026-09-27T01:00:00\.000Z is still running/);
    expect(runAdapter).not.toHaveBeenCalled();
  });

  it("GET /sync dedupes to the newest run per adapter (Prisma distinct, pruned by the janitor) rather than trimming a recent-N slice", async () => {
    asOwner();
    prismaMock.knowledgeSyncRun.findMany.mockResolvedValue([
      { id: "r3", adapter: "sharepoint", startedAt: new Date(3), finishedAt: new Date(3), counts: { imported: 5 }, details: { conflicts: [] }, error: null },
      { id: "r2", adapter: "backfill", startedAt: new Date(2), finishedAt: new Date(2), counts: {}, details: {}, error: null },
    ]);
    const json = await (await SYNC_RUNS(createRequest("GET", "/x"))).json();
    expect(json.runs.map((r: { id: string }) => r.id)).toEqual(["r3", "r2"]);
    const q = prismaMock.knowledgeSyncRun.findMany.mock.calls[0][0];
    expect(q).toMatchObject({ distinct: ["adapter"], orderBy: { startedAt: "desc" } });
    expect(q.take).toBeUndefined();
  });

  it("GET /sync reports whether embeddings are configured (the console's keyword-only banner)", async () => {
    asOwner();
    prismaMock.knowledgeSyncRun.findMany.mockResolvedValue([]);
    const prev = process.env.VOYAGE_API_KEY;
    try {
      delete process.env.VOYAGE_API_KEY;
      expect(await (await SYNC_RUNS(createRequest("GET", "/x"))).json()).toEqual({ runs: [], embeddingsConfigured: false });
      process.env.VOYAGE_API_KEY = "pa-test";
      expect((await (await SYNC_RUNS(createRequest("GET", "/x"))).json()).embeddingsConfigured).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.VOYAGE_API_KEY;
      else process.env.VOYAGE_API_KEY = prev;
    }
  });
});
