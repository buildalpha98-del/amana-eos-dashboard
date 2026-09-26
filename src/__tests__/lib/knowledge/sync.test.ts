import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { runBackfill, syncRegulator } = vi.hoisted(() => ({
  runBackfill: vi.fn(async () => ({ handbook: [{ sourceId: "h", outcome: "created" }], helpArticles: [{ sourceId: "a", outcome: "unchanged" }], centreFacts: [], lmsCourses: [], policies: [{ sourceId: "p", outcome: "error", error: "x" }], policiesRemaining: 3 })),
  syncRegulator: vi.fn(async () => ({ results: [{ sourceId: "r", outcome: "created" }], errors: [{ id: "gone", error: "HTTP 404" }] })),
}));
vi.mock("@/lib/knowledge/adapters/backfill", () => ({ runBackfill: () => runBackfill() }));
vi.mock("@/lib/knowledge/adapters/regulator", () => ({ syncRegulator: () => syncRegulator() }));
import { runAdapter } from "@/lib/knowledge/sync";

describe("runAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.knowledgeSyncRun.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "run1", ...data }));
    prismaMock.knowledgeSyncRun.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "run1", ...data }));
  });

  it("records a KnowledgeSyncRun with outcome counts for backfill, and a per-source failure sets run.error", async () => {
    const run = await runAdapter("backfill", "user-1");
    expect(prismaMock.knowledgeSyncRun.create.mock.calls[0][0].data).toMatchObject({ adapter: "backfill", startedById: "user-1" });
    const final = prismaMock.knowledgeSyncRun.update.mock.calls[0][0].data;
    expect(final.counts).toEqual({ created: 1, updated: 0, unchanged: 1, errors: 1 });
    expect(final.finishedAt).toBeInstanceOf(Date);
    // Partial failure is visible to BOTH the cron (guard.fail on run.error) and the console.
    expect(final.error).toBe("1 source failed");
    expect(final.details).toMatchObject({
      errors: [{ sourceId: "p", error: "x" }],
      policiesRemaining: 3,
      perAdapter: { policies: { created: 0, updated: 0, unchanged: 0, errors: 1 } },
    });
    // policiesRemaining is a number, not an adapter — it must not be tallied.
    expect(final.details.perAdapter).not.toHaveProperty("policiesRemaining");
    expect(run.id).toBe("run1");
  });

  it("a clean backfill leaves run.error null", async () => {
    runBackfill.mockResolvedValueOnce({ handbook: [{ sourceId: "h", outcome: "created" }], helpArticles: [], centreFacts: [], lmsCourses: [], policies: [], policiesRemaining: 0 });
    await runAdapter("backfill", null);
    const final = prismaMock.knowledgeSyncRun.update.mock.calls[0][0].data;
    expect(final.error).toBeNull();
    expect(final.counts).toEqual({ created: 1, updated: 0, unchanged: 0, errors: 0 });
  });

  it("records regulator fetch errors in details and fails the run with a summary", async () => {
    await runAdapter("regulator", null);
    const final = prismaMock.knowledgeSyncRun.update.mock.calls[0][0].data;
    expect(final.counts).toEqual({ created: 1, updated: 0, unchanged: 0, errors: 1 });
    expect(final.details).toMatchObject({ fetchErrors: [{ id: "gone", error: "HTTP 404" }] });
    expect(final.error).toBe("1 source failed");
  });

  it("pluralises the summary and a thrown adapter finalises the run with its message", async () => {
    syncRegulator.mockResolvedValueOnce({ results: [], errors: [{ id: "a", error: "x" }, { id: "b", error: "y" }] });
    await runAdapter("regulator", null);
    expect(prismaMock.knowledgeSyncRun.update.mock.calls[0][0].data.error).toBe("2 sources failed");

    syncRegulator.mockRejectedValueOnce(new Error("kaboom"));
    await runAdapter("regulator", null);
    const final = prismaMock.knowledgeSyncRun.update.mock.calls[1][0].data;
    expect(final).toMatchObject({ error: "kaboom", counts: {}, details: {} });
    expect(final.finishedAt).toBeInstanceOf(Date);
  });

  it("rejects an unknown adapter", async () => {
    await expect(runAdapter("sharepoint" as never, null)).rejects.toThrow(/not runnable/);
  });
});
