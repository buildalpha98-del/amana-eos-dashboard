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

import { _clearUserActiveCache } from "@/lib/server-auth";
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
