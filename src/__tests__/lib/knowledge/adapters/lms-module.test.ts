import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../../helpers/prisma-mock";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const { upsert, exclude } = vi.hoisted(() => ({
  upsert: vi.fn(async (_i?: unknown) => ({ sourceId: "s", outcome: "created" })),
  exclude: vi.fn(async (..._a: unknown[]) => 0),
}));
vi.mock("@/lib/knowledge/pipeline", () => ({ upsertKnowledgeSource: (i: unknown) => upsert(i), excludeSources: (...a: unknown[]) => exclude(...a) }));
import { syncLmsCourse, syncLmsModule } from "@/lib/knowledge/adapters/lms-module";

describe("lms_module adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("published course → indexes document modules only; quiz modules never; stale module sources excluded", async () => {
    prismaMock.lMSCourse.findUnique.mockResolvedValue({
      id: "c1", title: "Child Protection", status: "published", deleted: false, serviceId: null,
      modules: [
        { id: "m1", title: "Reading", type: "document", content: "# Intro\n…" },
        { id: "m2", title: "Quiz", type: "quiz", content: "answers" },
        { id: "m3", title: "Empty", type: "document", content: null },
      ],
    });
    await syncLmsCourse("c1");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      sourceKind: "lms_module", externalId: "c1:m1", title: "Child Protection — Reading", category: "guide",
      externalUrl: "/my-training", serviceId: null,
    });
    // No forced tier: inferTier reads the title, so "Child Protection — Reading" lands safety_critical.
    expect(upsert.mock.calls[0][0]).not.toHaveProperty("tier");
    // everything under this course that was NOT just indexed (quiz, empty, and any DELETED module) → adapter-excluded
    expect(exclude).toHaveBeenCalledWith(
      { sourceKind: "lms_module", externalId: { startsWith: "c1:", notIn: ["c1:m1"] } },
      "adapter",
    );
  });

  it("draft/archived/deleted course → every module source under it is adapter-excluded", async () => {
    prismaMock.lMSCourse.findUnique.mockResolvedValue({
      id: "c1", title: "X", status: "draft", deleted: false, serviceId: "svc1",
      modules: [{ id: "m1", title: "R", type: "document", content: "t" }],
    });
    await syncLmsCourse("c1");
    expect(upsert).not.toHaveBeenCalled();
    expect(exclude).toHaveBeenCalledWith({ sourceKind: "lms_module", externalId: { startsWith: "c1:" } }, "adapter");
  });

  it("centre-specific course → sources scoped to that service", async () => {
    prismaMock.lMSCourse.findUnique.mockResolvedValue({
      id: "c2", title: "Doveton Induction", status: "published", deleted: false, serviceId: "svc1",
      modules: [{ id: "m1", title: "Site", type: "document", content: "t" }],
    });
    await syncLmsCourse("c2");
    expect(upsert.mock.calls[0][0]).toMatchObject({ externalId: "c2:m1", serviceId: "svc1" });
  });

  it("syncLmsModule resolves the course and delegates", async () => {
    prismaMock.lMSModule.findUnique.mockResolvedValue({ courseId: "c1" });
    prismaMock.lMSCourse.findUnique.mockResolvedValue({ id: "c1", title: "X", status: "published", deleted: false, serviceId: null, modules: [] });
    await syncLmsModule("m9");
    expect(prismaMock.lMSCourse.findUnique).toHaveBeenCalled();
  });
});
