import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { canParentAccessPost } from "@/lib/parent-post-visibility";

const parent = {
  email: "jayden@example.com",
  name: "Jayden",
  enrolmentIds: ["enrol-1"],
};

describe("canParentAccessPost", () => {
  beforeEach(() => {
    prismaMock.parentPost.findUnique.mockReset();
    prismaMock.enrolmentSubmission.findMany.mockReset();
  });

  it("returns { post: null, allowed: false } when post not found", async () => {
    prismaMock.parentPost.findUnique.mockResolvedValue(null);
    const result = await canParentAccessPost(parent, "unknown");
    expect(result.post).toBeNull();
    expect(result.allowed).toBe(false);
  });

  it("denies when parent has no enrolments", async () => {
    prismaMock.parentPost.findUnique.mockResolvedValue({
      id: "p1",
      serviceId: "s1",
      isCommunity: true,
      tags: [],
    });
    const result = await canParentAccessPost(
      { ...parent, enrolmentIds: [] },
      "p1",
    );
    expect(result.allowed).toBe(false);
  });

  it("allows when post is community AND parent has access to service", async () => {
    prismaMock.parentPost.findUnique.mockResolvedValue({
      id: "p1",
      serviceId: "s1",
      isCommunity: true,
      tags: [],
    });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "s1", childRecords: [{ id: "c1" }] },
    ]);
    const result = await canParentAccessPost(parent, "p1");
    expect(result.allowed).toBe(true);
  });

  it("denies community post when parent has no access to the service", async () => {
    prismaMock.parentPost.findUnique.mockResolvedValue({
      id: "p1",
      serviceId: "s2-other",
      isCommunity: true,
      tags: [],
    });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "s1", childRecords: [{ id: "c1" }] },
    ]);
    const result = await canParentAccessPost(parent, "p1");
    expect(result.allowed).toBe(false);
  });

  it("allows child-tagged post when one of parent's children is tagged", async () => {
    prismaMock.parentPost.findUnique.mockResolvedValue({
      id: "p1",
      serviceId: "s1",
      isCommunity: false,
      tags: [{ childId: "c1" }],
    });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "s1", childRecords: [{ id: "c1" }] },
    ]);
    const result = await canParentAccessPost(parent, "p1");
    expect(result.allowed).toBe(true);
  });

  it("denies tagged post when no parent child is tagged", async () => {
    prismaMock.parentPost.findUnique.mockResolvedValue({
      id: "p1",
      serviceId: "s1",
      isCommunity: false,
      tags: [{ childId: "c999" }],
    });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "s1", childRecords: [{ id: "c1" }] },
    ]);
    const result = await canParentAccessPost(parent, "p1");
    expect(result.allowed).toBe(false);
  });
});
