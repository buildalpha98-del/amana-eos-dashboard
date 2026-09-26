import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/knowledge/adapters/backfill", () => ({
  runBackfill: vi.fn(async () => ({ handbook: [{ outcome: "created" }], helpArticles: [{ outcome: "unchanged" }], centreFacts: [], lmsCourses: [], policies: [{ outcome: "error", error: "x" }] })),
}));
vi.mock("@/lib/knowledge/adapters/regulator", () => ({
  syncRegulator: vi.fn(async () => ({ results: [{ outcome: "created" }], errors: [{ id: "gone", error: "HTTP 404" }] })),
}));
import { runAdapter } from "@/lib/knowledge/sync";

describe("runAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.knowledgeSyncRun.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "run1", ...data }));
    prismaMock.knowledgeSyncRun.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "run1", ...data }));
  });

  it("records a KnowledgeSyncRun with outcome counts for backfill", async () => {
    const run = await runAdapter("backfill", "user-1");
    expect(prismaMock.knowledgeSyncRun.create.mock.calls[0][0].data).toMatchObject({ adapter: "backfill", startedById: "user-1" });
    const final = prismaMock.knowledgeSyncRun.update.mock.calls[0][0].data;
    expect(final.counts).toEqual({ created: 1, updated: 0, unchanged: 1, errors: 1 });
    expect(final.finishedAt).toBeInstanceOf(Date);
    expect(run.id).toBe("run1");
  });

  it("records regulator fetch errors in details", async () => {
    await runAdapter("regulator", null);
    const final = prismaMock.knowledgeSyncRun.update.mock.calls[0][0].data;
    expect(final.counts).toEqual({ created: 1, updated: 0, unchanged: 0, errors: 1 });
    expect(final.details).toMatchObject({ fetchErrors: [{ id: "gone", error: "HTTP 404" }] });
  });

  it("rejects an unknown adapter", async () => {
    await expect(runAdapter("sharepoint" as never, null)).rejects.toThrow(/not runnable/);
  });
});
