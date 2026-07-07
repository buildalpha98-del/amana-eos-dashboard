import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/parent-notifications", () => ({
  notifyParentNewPost: vi.fn(() => Promise.resolve()),
}));

import { _clearUserActiveCache } from "@/lib/server-auth";
import { notifyParentNewPost } from "@/lib/parent-notifications";
import { GET, POST } from "@/app/api/services/[id]/reflections/route";
import { PATCH, DELETE } from "@/app/api/services/[id]/reflections/[reflectionId]/route";

async function ctx(id = "s1") {
  return { params: Promise.resolve({ id }) };
}
async function subCtx(id = "s1", reflectionId = "r1") {
  return { params: Promise.resolve({ id, reflectionId }) };
}

describe("reflections API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  describe("GET /api/services/[id]/reflections", () => {
    it("401 without session", async () => {
      mockNoSession();
      const res = await GET(
        createRequest("GET", "/api/services/s1/reflections"),
        await ctx(),
      );
      expect(res.status).toBe(401);
    });

    it("403 for cross-service coordinator", async () => {
      mockSession({ id: "u1", name: "C", role: "member", serviceId: "other" });
      const res = await GET(
        createRequest("GET", "/api/services/s1/reflections"),
        await ctx(),
      );
      expect(res.status).toBe(403);
    });

    it("filters by type + qa", async () => {
      mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
      prismaMock.staffReflection.findMany.mockResolvedValue([
        {
          id: "r1",
          type: "weekly",
          qualityAreas: [1, 3],
          createdAt: new Date(),
          author: { id: "u1", name: "C", avatar: null },
        },
      ]);
      const res = await GET(
        createRequest("GET", "/api/services/s1/reflections?type=weekly&qa=1"),
        await ctx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(prismaMock.staffReflection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            serviceId: "s1",
            type: "weekly",
            qualityAreas: { has: 1 },
          }),
        }),
      );
    });

    it("filters by from/to date range", async () => {
      mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
      prismaMock.staffReflection.findMany.mockResolvedValue([]);
      const res = await GET(
        createRequest(
          "GET",
          "/api/services/s1/reflections?type=daily&from=2026-07-06&to=2026-07-10",
        ),
        await ctx(),
      );
      expect(res.status).toBe(200);
      expect(prismaMock.staffReflection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: "daily",
            createdAt: {
              gte: new Date("2026-07-06"),
              lte: new Date("2026-07-10"),
            },
          }),
        }),
      );
    });

    it("400 on invalid from date", async () => {
      mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
      const res = await GET(
        createRequest("GET", "/api/services/s1/reflections?from=not-a-date"),
        await ctx(),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/services/[id]/reflections", () => {
    it("400 on invalid body", async () => {
      mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
      const res = await POST(
        createRequest("POST", "/api/services/s1/reflections", {
          body: { type: "bogus", title: "", content: "" },
        }),
        await ctx(),
      );
      expect(res.status).toBe(400);
    });

    it("creates a reflection", async () => {
      mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
      prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
      prismaMock.staffReflection.create.mockResolvedValue({
        id: "r1",
        type: "weekly",
        title: "Week in review",
        author: { id: "u1", name: "C", avatar: null },
      });
      prismaMock.activityLog.create.mockResolvedValue({});

      const res = await POST(
        createRequest("POST", "/api/services/s1/reflections", {
          body: {
            type: "weekly",
            title: "Week in review",
            content: "went well",
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(201);
    });

    it("dedupes by clientMutationId", async () => {
      mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
      const cmid = "550e8400-e29b-41d4-a716-446655440000";
      prismaMock.staffReflection.findUnique.mockResolvedValue({
        id: "r-existing",
        clientMutationId: cmid,
        type: "weekly",
        title: "Existing",
        author: { id: "u1", name: "C", avatar: null },
      });

      const res = await POST(
        createRequest("POST", "/api/services/s1/reflections", {
          body: {
            type: "weekly",
            title: "Replay",
            content: "x",
            clientMutationId: cmid,
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("r-existing");
      // Create must NOT have been called for dedup path
      expect(prismaMock.staffReflection.create).not.toHaveBeenCalled();
    });
  });

  describe("POST daily reflection fan-out", () => {
    const CHILD_A = "cjld2cjxh0000qzrmn831i7rn";
    const CHILD_B = "cjld2cjxh0001qzrmn831i7rn";

    function mockFanOutHappyPath() {
      mockSession({ id: "u1", name: "Edu", role: "staff", serviceId: "s1" });
      prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
      prismaMock.child.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          (where.id.in as string[])
            .filter((id) => [CHILD_A, CHILD_B].includes(id))
            .map((id) => ({ id, firstName: "Kid" })),
        ),
      );
      prismaMock.staffReflection.create.mockResolvedValue({
        id: "r-daily",
        type: "daily",
        title: "Daily reflection",
        author: { id: "u1", name: "Edu", avatar: null },
      });
      let obsCount = 0;
      prismaMock.learningObservation.create.mockImplementation(() =>
        Promise.resolve({ id: `obs-${++obsCount}` }),
      );
      prismaMock.parentPost.create.mockResolvedValue({ id: "post-1" });
      prismaMock.staffReflection.update.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: "r-daily",
          type: "daily",
          ...data,
          author: { id: "u1", name: "Edu", avatar: null },
        }),
      );
      prismaMock.activityLog.create.mockResolvedValue({});
    }

    function dailyBody(overrides: Record<string, unknown> = {}) {
      return {
        type: "daily",
        title: "Daily reflection",
        content: "We built a cubby and practised sharing.",
        mtopOutcomes: ["Wellbeing"],
        qualityAreas: [5],
        ...overrides,
      };
    }

    it("fans out to observations + parent post + notification", async () => {
      mockFanOutHappyPath();
      const res = await POST(
        createRequest("POST", "/api/services/s1/reflections", {
          body: dailyBody({ childIds: [CHILD_A, CHILD_B], shareWithParents: true }),
        }),
        await ctx(),
      );
      expect(res.status).toBe(201);

      expect(prismaMock.learningObservation.create).toHaveBeenCalledTimes(2);
      expect(prismaMock.learningObservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            childId: CHILD_A,
            serviceId: "s1",
            authorId: "u1",
            narrative: "We built a cubby and practised sharing.",
            mtopOutcomes: ["Wellbeing"],
            visibleToParent: true,
            sourceReflectionId: "r-daily",
          }),
        }),
      );

      expect(prismaMock.parentPost.create).toHaveBeenCalledTimes(1);
      const postArgs = prismaMock.parentPost.create.mock.calls[0][0];
      expect(postArgs.data.type).toBe("observation");
      expect(postArgs.data.isCommunity).toBe(false);
      expect(postArgs.data.tags.create).toHaveLength(2);

      expect(prismaMock.staffReflection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "r-daily" },
          data: expect.objectContaining({
            linkedObservationIds: ["obs-1", "obs-2"],
            parentPostId: "post-1",
          }),
        }),
      );

      expect(notifyParentNewPost).toHaveBeenCalledWith(
        "post-1",
        "Daily reflection",
        "observation",
        [CHILD_A, CHILD_B],
      );
      // activity log still written on the fan-out path
      expect(prismaMock.activityLog.create).toHaveBeenCalled();
    });

    it("no children + share → community post, no observations, no notify", async () => {
      mockFanOutHappyPath();
      const res = await POST(
        createRequest("POST", "/api/services/s1/reflections", {
          body: dailyBody({ shareWithParents: true }),
        }),
        await ctx(),
      );
      expect(res.status).toBe(201);
      expect(prismaMock.learningObservation.create).not.toHaveBeenCalled();
      const postArgs = prismaMock.parentPost.create.mock.calls[0][0];
      expect(postArgs.data.isCommunity).toBe(true);
      expect(postArgs.data.tags).toBeUndefined();
      expect(notifyParentNewPost).not.toHaveBeenCalled();
    });

    it("children without share → private observations, no post, no notify", async () => {
      mockFanOutHappyPath();
      const res = await POST(
        createRequest("POST", "/api/services/s1/reflections", {
          body: dailyBody({ childIds: [CHILD_A], shareWithParents: false }),
        }),
        await ctx(),
      );
      expect(res.status).toBe(201);
      expect(prismaMock.learningObservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ visibleToParent: false }),
        }),
      );
      expect(prismaMock.parentPost.create).not.toHaveBeenCalled();
      expect(notifyParentNewPost).not.toHaveBeenCalled();
    });

    it("weekly reflections never fan out", async () => {
      mockFanOutHappyPath();
      prismaMock.staffReflection.create.mockResolvedValue({
        id: "r-weekly",
        type: "weekly",
        title: "Week",
        author: { id: "u1", name: "Edu", avatar: null },
      });
      const res = await POST(
        createRequest("POST", "/api/services/s1/reflections", {
          body: { type: "weekly", title: "Week", content: "recap" },
        }),
        await ctx(),
      );
      expect(res.status).toBe(201);
      expect(prismaMock.learningObservation.create).not.toHaveBeenCalled();
      expect(prismaMock.parentPost.create).not.toHaveBeenCalled();
    });

    it("400 when a tagged child is not in this service", async () => {
      mockFanOutHappyPath();
      const res = await POST(
        createRequest("POST", "/api/services/s1/reflections", {
          body: dailyBody({
            childIds: [CHILD_A, "cjld2cjxh0002qzrmn831i7rz"],
            shareWithParents: true,
          }),
        }),
        await ctx(),
      );
      expect(res.status).toBe(400);
      expect(prismaMock.learningObservation.create).not.toHaveBeenCalled();
      expect(prismaMock.parentPost.create).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/services/[id]/reflections/[reflectionId]", () => {
    it("403 when not the author and not admin", async () => {
      mockSession({
        id: "u2",
        name: "Other",
        role: "member",
        serviceId: "s1",
      });
      prismaMock.staffReflection.findUnique.mockResolvedValue({
        id: "r1",
        serviceId: "s1",
        authorId: "u1",
      });
      const res = await PATCH(
        createRequest("PATCH", "/api/services/s1/reflections/r1", {
          body: { title: "new" },
        }),
        await subCtx(),
      );
      expect(res.status).toBe(403);
    });

    it("allows author edits", async () => {
      mockSession({ id: "u1", name: "Me", role: "member", serviceId: "s1" });
      prismaMock.staffReflection.findUnique.mockResolvedValue({
        id: "r1",
        serviceId: "s1",
        authorId: "u1",
      });
      prismaMock.staffReflection.update.mockResolvedValue({
        id: "r1",
        title: "new",
        author: { id: "u1", name: "Me", avatar: null },
      });
      const res = await PATCH(
        createRequest("PATCH", "/api/services/s1/reflections/r1", {
          body: { title: "new" },
        }),
        await subCtx(),
      );
      expect(res.status).toBe(200);
    });
  });

  describe("DELETE /api/services/[id]/reflections/[reflectionId]", () => {
    it("admin can delete any reflection", async () => {
      mockSession({
        id: "u2",
        name: "Admin",
        role: "admin",
        serviceId: "s1",
      });
      prismaMock.staffReflection.findUnique.mockResolvedValue({
        id: "r1",
        serviceId: "s1",
        authorId: "u1",
      });
      prismaMock.staffReflection.delete.mockResolvedValue({});
      const res = await DELETE(
        createRequest("DELETE", "/api/services/s1/reflections/r1"),
        await subCtx(),
      );
      expect(res.status).toBe(200);
    });
  });
});
