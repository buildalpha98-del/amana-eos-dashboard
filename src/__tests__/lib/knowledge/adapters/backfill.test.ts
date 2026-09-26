import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { syncHandbook, syncHelpArticles, syncCentreFacts, syncLmsCourse, syncPolicyVersion } = vi.hoisted(() => ({
  syncHandbook: vi.fn(async () => [] as unknown[]),
  syncHelpArticles: vi.fn(async () => [] as unknown[]),
  syncCentreFacts: vi.fn(async (_serviceId: string) => null as unknown),
  syncLmsCourse: vi.fn(async (_courseId: string) => [] as unknown[]),
  syncPolicyVersion: vi.fn(async (_versionId: string) => null as unknown),
}));
vi.mock("@/lib/knowledge/adapters/handbook", () => ({ syncHandbook }));
vi.mock("@/lib/knowledge/adapters/help-article", () => ({ syncHelpArticles }));
vi.mock("@/lib/knowledge/adapters/centre-facts", () => ({ syncCentreFacts }));
vi.mock("@/lib/knowledge/adapters/lms-module", () => ({ syncLmsCourse }));
vi.mock("@/lib/knowledge/adapters/policy-upload", () => ({ syncPolicyVersion }));
// sourceNeedsIndex stays REAL (the batching must agree with the upsert fast-path); only the key check is controlled.
const { isEmbeddingsConfigured } = vi.hoisted(() => ({ isEmbeddingsConfigured: vi.fn(() => true) }));
vi.mock("@/lib/embeddings", () => ({
  isEmbeddingsConfigured: () => isEmbeddingsConfigured(),
  embedTextsWithUsage: vi.fn(),
  toVectorLiteral: (v: number[]) => `[${v.join(",")}]`,
  EMBEDDING_MODEL: "voyage-3",
}));

import { runBackfill, POLICY_BATCH_SIZE } from "@/lib/knowledge/adapters/backfill";

/** A stored policy_upload row as the backfill's pending check reads it. */
const settledRow = (id: string) => ({ externalId: id, indexedAt: new Date("2026-01-01"), indexError: null, embedded: true });

describe("runBackfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isEmbeddingsConfigured.mockReturnValue(true);
    prismaMock.service.findMany.mockResolvedValue([]);
    prismaMock.lMSCourse.findMany.mockResolvedValue([]);
    prismaMock.policyDocument.findMany.mockResolvedValue([]);
    prismaMock.knowledgeSource.findMany.mockResolvedValue([]);
  });

  it("scopes services to active only", async () => {
    await runBackfill();
    expect(prismaMock.service.findMany).toHaveBeenCalledWith({
      where: { status: "active" },
      select: { id: true },
    });
  });

  it("scopes LMS courses to published + not deleted", async () => {
    await runBackfill();
    expect(prismaMock.lMSCourse.findMany).toHaveBeenCalledWith({
      where: { status: "published", deleted: false },
      select: { id: true },
    });
  });

  it("scopes policies to non-archived with a current version", async () => {
    await runBackfill();
    expect(prismaMock.policyDocument.findMany).toHaveBeenCalledWith({
      where: { isArchived: false, currentVersionId: { not: null } },
      select: { currentVersionId: true },
    });
  });

  it("skips a policy row with a null currentVersionId without calling syncPolicyVersion", async () => {
    prismaMock.policyDocument.findMany.mockResolvedValue([{ currentVersionId: null }, { currentVersionId: "v9" }]);
    syncPolicyVersion.mockResolvedValue({ sourceId: "s9", outcome: "created" });
    const report = await runBackfill();
    expect(syncPolicyVersion).toHaveBeenCalledTimes(1);
    expect(syncPolicyVersion).toHaveBeenCalledWith("v9");
    expect(report.policies).toEqual([{ sourceId: "s9", outcome: "created" }]);
  });

  it("aggregates results from every sub-adapter", async () => {
    syncHandbook.mockResolvedValue([{ sourceId: "h1", outcome: "created" }]);
    syncHelpArticles.mockResolvedValue([{ sourceId: "a1", outcome: "unchanged" }]);
    prismaMock.service.findMany.mockResolvedValue([{ id: "svc1" }]);
    syncCentreFacts.mockResolvedValue({ sourceId: "c1", outcome: "created" });
    prismaMock.lMSCourse.findMany.mockResolvedValue([{ id: "course1" }]);
    syncLmsCourse.mockResolvedValue([{ sourceId: "l1", outcome: "created" }]);
    prismaMock.policyDocument.findMany.mockResolvedValue([{ currentVersionId: "v1" }]);
    syncPolicyVersion.mockResolvedValue({ sourceId: "p1", outcome: "created" });

    const report = await runBackfill();
    expect(report).toEqual({
      handbook: [{ sourceId: "h1", outcome: "created" }],
      helpArticles: [{ sourceId: "a1", outcome: "unchanged" }],
      centreFacts: [{ sourceId: "c1", outcome: "created" }],
      lmsCourses: [{ sourceId: "l1", outcome: "created" }],
      policies: [{ sourceId: "p1", outcome: "created" }],
      policiesRemaining: 0,
    });
    expect(syncCentreFacts).toHaveBeenCalledWith("svc1");
    expect(syncLmsCourse).toHaveBeenCalledWith("course1");
  });

  describe("policy PDF batching", () => {
    const ids = (n: number, prefix = "v") => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

    it("processes at most POLICY_BATCH_SIZE policies per run and reports the pending ones it did not reach", async () => {
      expect(POLICY_BATCH_SIZE).toBe(25);
      prismaMock.policyDocument.findMany.mockResolvedValue(ids(40).map((id) => ({ currentVersionId: id })));
      syncPolicyVersion.mockImplementation(async (id: string) => ({ sourceId: `s-${id}`, outcome: "created" }));
      const report = await runBackfill();
      expect(syncPolicyVersion).toHaveBeenCalledTimes(25);
      expect(report.policies).toHaveLength(25);
      expect(report.policiesRemaining).toBe(15);
      // The pending lookup is scoped to exactly these version ids.
      expect(prismaMock.knowledgeSource.findMany).toHaveBeenCalledWith({
        where: { sourceKind: "policy_upload", externalId: { in: ids(40) } },
        select: { externalId: true, indexedAt: true, indexError: true, embedded: true },
      });
    });

    it("pending policies (no row / unfinished / failed / keyword-only with a key) go first; settled rows fill the rest and never count as remaining", async () => {
      // 30 policies: v1-v24 settled, v25 new, v26 unfinished, v27 failed, v28 keyword-only, v29-v30 settled.
      prismaMock.policyDocument.findMany.mockResolvedValue(ids(30).map((id) => ({ currentVersionId: id })));
      prismaMock.knowledgeSource.findMany.mockResolvedValue([
        ...ids(24).map(settledRow),
        { ...settledRow("v26"), indexedAt: null, embedded: false },
        { ...settledRow("v27"), indexError: "boom" },
        { ...settledRow("v28"), embedded: false },
        settledRow("v29"),
        settledRow("v30"),
      ]);
      syncPolicyVersion.mockImplementation(async (id: string) => ({ sourceId: `s-${id}`, outcome: "created" }));
      const report = await runBackfill();
      const order = syncPolicyVersion.mock.calls.map((c) => c[0]);
      expect(order.slice(0, 4)).toEqual(["v25", "v26", "v27", "v28"]);
      expect(order).toHaveLength(25);
      // 21 settled rows re-verified as capacity allowed; 5 settled rows left over are NOT "remaining".
      expect(report.policiesRemaining).toBe(0);
    });

    it("a keyword-only row with NO embeddings key is settled, not pending", async () => {
      isEmbeddingsConfigured.mockReturnValue(false);
      prismaMock.policyDocument.findMany.mockResolvedValue([{ currentVersionId: "v1" }, { currentVersionId: "v2" }]);
      prismaMock.knowledgeSource.findMany.mockResolvedValue([{ ...settledRow("v1"), embedded: false }]);
      syncPolicyVersion.mockImplementation(async (id: string) => ({ sourceId: `s-${id}`, outcome: "unchanged" }));
      await runBackfill();
      // v2 (no row) is pending and goes first; v1 is settled and follows.
      expect(syncPolicyVersion.mock.calls.map((c) => c[0])).toEqual(["v2", "v1"]);
    });

    it("remaining counts pending policies beyond the batch, not settled ones", async () => {
      prismaMock.policyDocument.findMany.mockResolvedValue(ids(30).map((id) => ({ currentVersionId: id })));
      // Only v1-v3 are stored; 27 are pending → 2 beyond the batch of 25.
      prismaMock.knowledgeSource.findMany.mockResolvedValue(ids(3).map(settledRow));
      syncPolicyVersion.mockImplementation(async (id: string) => ({ sourceId: `s-${id}`, outcome: "created" }));
      const report = await runBackfill();
      expect(report.policiesRemaining).toBe(2);
      expect(syncPolicyVersion.mock.calls.map((c) => c[0])).not.toContain("v1"); // settled rows did not fit
    });
  });
});
