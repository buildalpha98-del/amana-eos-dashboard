import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 59, resetIn: 60000 })) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, generateRequestId: () => "t" }));
const { createManual, updateManual, runAdapter } = vi.hoisted(() => ({
  createManual: vi.fn(async (_i?: unknown) => ({ sourceId: "k1", outcome: "created" })),
  updateManual: vi.fn(async (..._a: unknown[]) => ({ sourceId: "k1", outcome: "updated" })),
  runAdapter: vi.fn(async (..._a: unknown[]) => ({ id: "run1", counts: { created: 1 } })),
}));
vi.mock("@/lib/knowledge/adapters/manual", () => ({ createManualSource: (i: unknown) => createManual(i), updateManualSource: (...a: unknown[]) => updateManual(...a) }));
vi.mock("@/lib/knowledge/sync", () => ({ runAdapter: (...a: unknown[]) => runAdapter(...a), RUNNABLE_ADAPTERS: ["backfill", "regulator"] }));
vi.mock("@/lib/knowledge/pipeline", () => ({ indexSource: vi.fn(async () => ({ ok: true, chunks: 2 })) }));
vi.mock("@/lib/storage", () => ({ deleteFile: vi.fn() }));

import { GET, POST } from "@/app/api/settings/ai-knowledge/route";
import { PATCH, DELETE } from "@/app/api/settings/ai-knowledge/[id]/route";
import { POST as SYNC, GET as SYNC_RUNS } from "@/app/api/settings/ai-knowledge/sync/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

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
    mockSession({ id: "u", name: "O", role: "owner" });
    prismaMock.knowledgeSource.findMany.mockResolvedValue([{
      id: "k1", title: "T", sourceKind: "manual", category: "guide", tier: "general", tierOverride: null, qualityArea: null,
      serviceId: "s1", service: { name: "Doveton" }, state: null, version: null, status: "active", excludedBy: null, externalUrl: null,
      indexedAt: null, indexError: null, createdAt: new Date(), updatedAt: new Date(), _count: { chunks: 3 },
    }]);
    const res = await GET(createRequest("GET", "/api/settings/ai-knowledge"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.entries[0]).toMatchObject({ id: "k1", chunkCount: 3, serviceName: "Doveton" });
    expect(prismaMock.knowledgeSource.findMany.mock.calls[0][0].where).toBeUndefined();
  });

  it("POST validates and creates a manual source", async () => {
    mockSession({ id: "u", name: "O", role: "owner" });
    expect((await POST(createRequest("POST", "/api/settings/ai-knowledge", { body: { title: "" } }))).status).toBe(400);
    const res = await POST(createRequest("POST", "/api/settings/ai-knowledge", { body: { title: "Roll call", body: "# Roll call\n…", category: "sop", tier: "safety_critical" } }));
    expect(res.status).toBe(201);
    expect(createManual.mock.calls[0][0]).toMatchObject({ title: "Roll call", text: "# Roll call\n…", category: "sop", tier: "safety_critical" });
  });

  it("PATCH updates title/body for manual, tierOverride/status for any kind; 404 unknown", async () => {
    mockSession({ id: "u", name: "O", role: "owner" });
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({ id: "k1", sourceKind: "sharepoint", externalUrl: null });
    prismaMock.knowledgeSource.update.mockResolvedValue({});
    expect((await PATCH(createRequest("PATCH", "/x", { body: { body: "new" } }), ctx("k1"))).status).toBe(400); // not manual
    expect((await PATCH(createRequest("PATCH", "/x", { body: { tierOverride: "safety_critical", status: "excluded" } }), ctx("k1"))).status).toBe(200);
    expect(prismaMock.knowledgeSource.update.mock.calls[0][0].data).toEqual({ tierOverride: "safety_critical", status: "excluded", excludedBy: "admin" });
    prismaMock.knowledgeSource.findUnique.mockResolvedValue(null);
    expect((await PATCH(createRequest("PATCH", "/x", { body: { title: "t" } }), ctx("nope"))).status).toBe(404);
  });

  it("DELETE removes a manual source (and its blob) but refuses adapter-owned sources", async () => {
    mockSession({ id: "u", name: "O", role: "owner" });
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({ id: "k1", sourceKind: "manual", externalUrl: "https://blob/x.pdf" });
    prismaMock.knowledgeSource.delete.mockResolvedValue({});
    expect((await DELETE(createRequest("DELETE", "/x"), ctx("k1"))).status).toBe(200);
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({ id: "k2", sourceKind: "policy_upload", externalUrl: null });
    expect((await DELETE(createRequest("DELETE", "/x"), ctx("k2"))).status).toBe(400);
  });

  it("POST /sync runs a runnable adapter and rejects others", async () => {
    mockSession({ id: "u", name: "O", role: "owner" });
    expect((await SYNC(createRequest("POST", "/x", { body: { adapter: "sharepoint" } }))).status).toBe(400);
    const res = await SYNC(createRequest("POST", "/x", { body: { adapter: "backfill" } }));
    expect(res.status).toBe(200);
    expect(runAdapter).toHaveBeenCalledWith("backfill", "u");
  });

  it("GET /sync returns the latest run per adapter", async () => {
    mockSession({ id: "u", name: "O", role: "owner" });
    prismaMock.knowledgeSyncRun.findMany.mockResolvedValue([
      { id: "r3", adapter: "sharepoint", startedAt: new Date(3), finishedAt: new Date(3), counts: { imported: 5 }, details: { conflicts: [] }, error: null },
      { id: "r2", adapter: "backfill", startedAt: new Date(2), finishedAt: new Date(2), counts: {}, details: {}, error: null },
      { id: "r1", adapter: "sharepoint", startedAt: new Date(1), finishedAt: new Date(1), counts: {}, details: {}, error: null },
    ]);
    const json = await (await SYNC_RUNS(createRequest("GET", "/x"))).json();
    expect(json.runs.map((r: { id: string }) => r.id)).toEqual(["r3", "r2"]);
  });
});
