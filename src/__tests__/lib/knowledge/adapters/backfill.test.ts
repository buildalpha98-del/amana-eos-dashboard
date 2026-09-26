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

import { runBackfill } from "@/lib/knowledge/adapters/backfill";

describe("runBackfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.service.findMany.mockResolvedValue([]);
    prismaMock.lMSCourse.findMany.mockResolvedValue([]);
    prismaMock.policyDocument.findMany.mockResolvedValue([]);
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
    });
    expect(syncCentreFacts).toHaveBeenCalledWith("svc1");
    expect(syncLmsCourse).toHaveBeenCalledWith("course1");
  });
});
