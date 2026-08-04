/**
 * Who sees which posts.
 *
 * Two properties matter here, and they pull in opposite directions:
 *
 *  1. Every family at a centre sees that centre's published posts —
 *     tagging decides which child's page a post ALSO appears on, not who
 *     is allowed to see it.
 *  2. A parent is never shown another family's child's name. The tag
 *     list is filtered server-side, so the names simply never leave the
 *     building.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    enrolmentSubmission: { findMany: vi.fn() },
    parentPost: { findMany: vi.fn() },
    centreContact: { findMany: vi.fn() },
    parentPostLike: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/parent-auth", () => ({
  withParentAuth:
    (
      handler: (
        req: Request,
        ctx: { parent: { email: string; enrolmentIds: string[] } },
      ) => Promise<Response>,
    ) =>
    (req: Request) =>
      handler(req, {
        parent: { email: "jane@example.com", enrolmentIds: ["enr-1"] },
      }),
}));

import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/parent/timeline/route";

const mockPrisma = prisma as unknown as {
  enrolmentSubmission: { findMany: ReturnType<typeof vi.fn> };
  parentPost: { findMany: ReturnType<typeof vi.fn> };
  centreContact: { findMany: ReturnType<typeof vi.fn> };
  parentPostLike: { findMany: ReturnType<typeof vi.fn> };
};

const req = (qs = "") =>
  new Request(
    `http://localhost/api/parent/timeline${qs}`,
  ) as unknown as import("next/server").NextRequest;

describe("GET /api/parent/timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "svc-1", childRecords: [{ id: "mine-1" }, { id: "mine-2" }] },
    ]);
    mockPrisma.parentPost.findMany.mockResolvedValue([]);
    mockPrisma.centreContact.findMany.mockResolvedValue([]);
    mockPrisma.parentPostLike.findMany.mockResolvedValue([]);
  });

  it("scopes to the family's centres and nothing else", async () => {
    await GET(req());
    const where = mockPrisma.parentPost.findMany.mock.calls[0][0].where;
    // The check that actually prevents a cross-centre leak.
    expect(where.serviceId).toEqual({ in: ["svc-1"] });
  });

  it("does NOT require a tag to see a post", async () => {
    // Previously the query also demanded isCommunity OR a tag matching
    // one of this family's children, which meant an untagged observation
    // reached nobody and a tagged one quietly became private.
    await GET(req());
    const where = mockPrisma.parentPost.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
    expect(where.isCommunity).toBeUndefined();
  });

  it("hides drafts, and scheduled posts until their time", async () => {
    await GET(req());
    const where = mockPrisma.parentPost.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "draft" });
    expect(where.AND[0].OR[0]).toEqual({ publishAt: null });
    expect(where.AND[0].OR[1].publishAt.lte).toBeInstanceOf(Date);
  });

  it("only ever includes THIS family's children in the tag list", async () => {
    await GET(req());
    const include = mockPrisma.parentPost.findMany.mock.calls[0][0].include;
    expect(include.tags.where).toEqual({
      childId: { in: ["mine-1", "mine-2"] },
    });
  });

  it("narrows to one child for their moments page", async () => {
    await GET(req("?childId=mine-2"));
    const where = mockPrisma.parentPost.findMany.mock.calls[0][0].where;
    expect(where.tags).toEqual({ some: { childId: "mine-2" } });
  });

  it("returns empty for a childId that isn't theirs", async () => {
    // Not another family's posts, and not an error that confirms the id
    // exists — just nothing.
    const res = await GET(req("?childId=someone-elses-kid"));
    expect(await res.json()).toEqual({ items: [] });
    expect(mockPrisma.parentPost.findMany).not.toHaveBeenCalled();
  });

  it("returns empty when the family has no centre yet", async () => {
    mockPrisma.enrolmentSubmission.findMany.mockResolvedValue([]);
    const res = await GET(req());
    expect((await res.json()).items).toEqual([]);
    expect(mockPrisma.parentPost.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/parent/timeline — category filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "svc-1", childRecords: [{ id: "mine-1" }] },
    ]);
    mockPrisma.parentPost.findMany.mockResolvedValue([]);
    mockPrisma.centreContact.findMany.mockResolvedValue([]);
    mockPrisma.parentPostLike.findMany.mockResolvedValue([]);
  });

  it("returns every category by default — Home shows the lot", async () => {
    await GET(req());
    const where = mockPrisma.parentPost.findMany.mock.calls[0][0].where;
    expect(where.type).toBeUndefined();
  });

  it("narrows to the requested categories", async () => {
    // My Centre asks for announcements + reminders so it isn't the same
    // list as Home rendered a second time.
    await GET(req("?types=announcement,reminder"));
    const where = mockPrisma.parentPost.findMany.mock.calls[0][0].where;
    expect(where.type).toEqual({ in: ["announcement", "reminder"] });
  });

  it("ignores blank entries in the list", async () => {
    await GET(req("?types=announcement,,%20,reminder"));
    const where = mockPrisma.parentPost.findMany.mock.calls[0][0].where;
    expect(where.type).toEqual({ in: ["announcement", "reminder"] });
  });
});
