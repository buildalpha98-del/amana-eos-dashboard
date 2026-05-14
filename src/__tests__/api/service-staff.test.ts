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
import { GET, POST } from "@/app/api/services/[id]/staff/route";
import {
  PATCH,
  DELETE,
} from "@/app/api/services/[id]/staff/[membershipId]/route";

async function ctx(id = "s1") {
  return { params: Promise.resolve({ id }) };
}
async function subCtx(id = "s1", membershipId = "m1") {
  return { params: Promise.resolve({ id, membershipId }) };
}

const PRIMARY_USER = {
  id: "primary-u1",
  name: "Priya Primary",
  email: "priya@example.com",
  avatar: null,
  role: "member" as const,
  serviceId: "s1",
  active: true,
  createdAt: new Date("2026-01-15T00:00:00Z"),
};
const ADDITIONAL_USER = {
  id: "extra-u2",
  name: "Eddie Extra",
  email: "eddie@example.com",
  avatar: null,
  role: "staff" as const,
  serviceId: "s2",
  active: true,
  createdAt: new Date("2026-02-10T00:00:00Z"),
};

describe("service staff API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  describe("GET /api/services/[id]/staff", () => {
    it("401 without session", async () => {
      mockNoSession();
      const res = await GET(
        createRequest("GET", "/api/services/s1/staff"),
        await ctx(),
      );
      expect(res.status).toBe(401);
    });

    it("merges primary users + active memberships into single list", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.user.findMany.mockResolvedValue([PRIMARY_USER]);
      prismaMock.userServiceMembership.findMany.mockResolvedValue([
        {
          id: "m1",
          serviceId: "s1",
          userId: "extra-u2",
          roleAtService: "Room Leader",
          accessLevel: "contributor",
          startDate: new Date("2026-04-01T00:00:00Z"),
          endDate: null,
          status: "active",
          user: ADDITIONAL_USER,
        },
      ]);

      const res = await GET(
        createRequest("GET", "/api/services/s1/staff"),
        await ctx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.members).toHaveLength(2);

      const primary = body.members.find(
        (m: { userId: string }) => m.userId === PRIMARY_USER.id,
      );
      expect(primary.isPrimary).toBe(true);
      expect(primary.membership.id).toBeNull();
      expect(primary.membership.roleAtService).toBe("OSHC Educator");
      expect(primary.membership.accessLevel).toBe("admin");
      expect(primary.membership.startDate).toBe("2026-01-15");

      const additional = body.members.find(
        (m: { userId: string }) => m.userId === ADDITIONAL_USER.id,
      );
      expect(additional.isPrimary).toBe(false);
      expect(additional.membership.id).toBe("m1");
      expect(additional.membership.roleAtService).toBe("Room Leader");
      expect(additional.membership.accessLevel).toBe("contributor");
      expect(additional.membership.startDate).toBe("2026-04-01");
    });

    it("only includes active memberships (status filter pushed to query)", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.userServiceMembership.findMany.mockResolvedValue([]);

      await GET(
        createRequest("GET", "/api/services/s1/staff"),
        await ctx(),
      );

      const findManyCall =
        prismaMock.userServiceMembership.findMany.mock.calls[0]?.[0];
      expect(findManyCall.where.serviceId).toBe("s1");
      expect(findManyCall.where.status).toBe("active");
    });

    it("cross-service educator can still read (read access is permissive)", async () => {
      mockSession({ id: "u-other", name: "O", role: "staff", serviceId: "s99" });
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.userServiceMembership.findMany.mockResolvedValue([]);

      const res = await GET(
        createRequest("GET", "/api/services/s1/staff"),
        await ctx(),
      );
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/services/[id]/staff", () => {
    it("400 on invalid body", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      const res = await POST(
        createRequest("POST", "/api/services/s1/staff", {
          body: { userId: "", roleAtService: "" },
        }),
        await ctx(),
      );
      expect(res.status).toBe(400);
    });

    it("403 when Director of a different service", async () => {
      mockSession({
        id: "dir-other",
        name: "D",
        role: "member",
        serviceId: "s99",
      });
      const res = await POST(
        createRequest("POST", "/api/services/s1/staff", {
          body: {
            userId: "u2",
            roleAtService: "Educator",
            accessLevel: "contributor",
            startDate: "2026-05-14",
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(403);
    });

    it("403 for staff/marketing", async () => {
      mockSession({ id: "edu", name: "E", role: "staff", serviceId: "s1" });
      const res = await POST(
        createRequest("POST", "/api/services/s1/staff", {
          body: {
            userId: "u2",
            roleAtService: "Educator",
            accessLevel: "contributor",
            startDate: "2026-05-14",
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(403);
    });

    it("404 when user does not exist", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === "missing") return Promise.resolve(null);
        return Promise.resolve({ active: true });
      });
      const res = await POST(
        createRequest("POST", "/api/services/s1/staff", {
          body: {
            userId: "missing",
            roleAtService: "Educator",
            accessLevel: "contributor",
            startDate: "2026-05-14",
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(404);
    });

    it("409 when user is already primary at this service", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === "primary-u1") {
          return Promise.resolve({
            ...PRIMARY_USER,
            active: true,
          });
        }
        return Promise.resolve({ active: true });
      });
      const res = await POST(
        createRequest("POST", "/api/services/s1/staff", {
          body: {
            userId: "primary-u1",
            roleAtService: "Educator",
            accessLevel: "contributor",
            startDate: "2026-05-14",
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(409);
    });

    it("409 when user already has active membership at this service", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === "extra-u2") {
          return Promise.resolve({
            id: "extra-u2",
            serviceId: "s99",
            active: true,
          });
        }
        return Promise.resolve({ active: true });
      });
      prismaMock.userServiceMembership.findUnique.mockResolvedValue({
        id: "m1",
        status: "active",
      });
      const res = await POST(
        createRequest("POST", "/api/services/s1/staff", {
          body: {
            userId: "extra-u2",
            roleAtService: "Educator",
            accessLevel: "contributor",
            startDate: "2026-05-14",
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(409);
    });

    it("reactivates an existing inactive membership row", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === "extra-u2") {
          return Promise.resolve({
            id: "extra-u2",
            serviceId: "s99",
            active: true,
          });
        }
        return Promise.resolve({ active: true });
      });
      prismaMock.userServiceMembership.findUnique.mockResolvedValue({
        id: "m-old",
        status: "inactive",
      });
      prismaMock.userServiceMembership.update.mockResolvedValue({
        id: "m-old",
        status: "active",
      });

      const res = await POST(
        createRequest("POST", "/api/services/s1/staff", {
          body: {
            userId: "extra-u2",
            roleAtService: "Educator",
            accessLevel: "contributor",
            startDate: "2026-05-14",
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.reactivated).toBe(true);
      expect(prismaMock.userServiceMembership.update).toHaveBeenCalled();
    });

    it("creates a fresh membership on happy path", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === "extra-u2") {
          return Promise.resolve({
            id: "extra-u2",
            serviceId: "s99",
            active: true,
          });
        }
        return Promise.resolve({ active: true });
      });
      prismaMock.userServiceMembership.findUnique.mockResolvedValue(null);
      prismaMock.userServiceMembership.create.mockResolvedValue({
        id: "m-new",
        serviceId: "s1",
        userId: "extra-u2",
        roleAtService: "Educator",
        accessLevel: "contributor",
        startDate: new Date("2026-05-14"),
        endDate: null,
        status: "active",
      });

      const res = await POST(
        createRequest("POST", "/api/services/s1/staff", {
          body: {
            userId: "extra-u2",
            roleAtService: "Educator",
            accessLevel: "contributor",
            startDate: "2026-05-14",
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(201);
    });

    it("maps Prisma P2002 unique-constraint collision to 409 (race condition)", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === "extra-u2") {
          return Promise.resolve({
            id: "extra-u2",
            serviceId: "s99",
            active: true,
          });
        }
        return Promise.resolve({ active: true });
      });
      prismaMock.userServiceMembership.findUnique.mockResolvedValue(null);
      const p2002: Error & { code?: string } = new Error("Unique constraint");
      p2002.code = "P2002";
      prismaMock.userServiceMembership.create.mockRejectedValue(p2002);

      const res = await POST(
        createRequest("POST", "/api/services/s1/staff", {
          body: {
            userId: "extra-u2",
            roleAtService: "Educator",
            accessLevel: "contributor",
            startDate: "2026-05-14",
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(409);
    });

    it("Director-of-own-service can create memberships at their service", async () => {
      mockSession({
        id: "dir-1",
        name: "Dee",
        role: "member",
        serviceId: "s1",
      });
      prismaMock.service.findUnique.mockResolvedValue({ id: "s1" });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === "extra-u2") {
          return Promise.resolve({
            id: "extra-u2",
            serviceId: "s99",
            active: true,
          });
        }
        return Promise.resolve({ active: true });
      });
      prismaMock.userServiceMembership.findUnique.mockResolvedValue(null);
      prismaMock.userServiceMembership.create.mockResolvedValue({
        id: "m-new",
        serviceId: "s1",
      });

      const res = await POST(
        createRequest("POST", "/api/services/s1/staff", {
          body: {
            userId: "extra-u2",
            roleAtService: "Educator",
            accessLevel: "contributor",
            startDate: "2026-05-14",
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(201);
    });
  });

  describe("PATCH /api/services/[id]/staff/[membershipId]", () => {
    it("404 if membership belongs to a different service", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.userServiceMembership.findUnique.mockResolvedValue({
        id: "m1",
        serviceId: "s99",
        status: "active",
      });

      const res = await PATCH(
        createRequest("PATCH", "/api/services/s1/staff/m1", {
          body: { roleAtService: "Updated" },
        }),
        await subCtx(),
      );
      expect(res.status).toBe(404);
    });

    it("403 from Director of another service", async () => {
      mockSession({
        id: "dir-other",
        name: "D",
        role: "member",
        serviceId: "s99",
      });
      const res = await PATCH(
        createRequest("PATCH", "/api/services/s1/staff/m1", {
          body: { roleAtService: "Updated" },
        }),
        await subCtx(),
      );
      expect(res.status).toBe(403);
    });

    it("updates fields on success", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.userServiceMembership.findUnique.mockResolvedValue({
        id: "m1",
        serviceId: "s1",
        status: "active",
      });
      prismaMock.userServiceMembership.update.mockResolvedValue({
        id: "m1",
        serviceId: "s1",
        roleAtService: "Updated",
        accessLevel: "admin",
      });

      const res = await PATCH(
        createRequest("PATCH", "/api/services/s1/staff/m1", {
          body: { roleAtService: "Updated", accessLevel: "admin" },
        }),
        await subCtx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.roleAtService).toBe("Updated");
    });
  });

  describe("DELETE /api/services/[id]/staff/[membershipId]", () => {
    it("404 if membership belongs to a different service", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.userServiceMembership.findUnique.mockResolvedValue({
        id: "m1",
        serviceId: "s99",
        status: "active",
      });

      const res = await DELETE(
        createRequest("DELETE", "/api/services/s1/staff/m1"),
        await subCtx(),
      );
      expect(res.status).toBe(404);
    });

    it("403 from Director of another service", async () => {
      mockSession({
        id: "dir-other",
        name: "D",
        role: "member",
        serviceId: "s99",
      });
      const res = await DELETE(
        createRequest("DELETE", "/api/services/s1/staff/m1"),
        await subCtx(),
      );
      expect(res.status).toBe(403);
    });

    it("soft-removes (flips status to inactive + sets endDate)", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.userServiceMembership.findUnique.mockResolvedValue({
        id: "m1",
        serviceId: "s1",
        status: "active",
        endDate: null,
      });
      prismaMock.userServiceMembership.update.mockResolvedValue({
        id: "m1",
        status: "inactive",
        endDate: new Date(),
      });

      const res = await DELETE(
        createRequest("DELETE", "/api/services/s1/staff/m1"),
        await subCtx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      const updateCall =
        prismaMock.userServiceMembership.update.mock.calls[0]?.[0];
      expect(updateCall.data.status).toBe("inactive");
      expect(updateCall.data.endDate).toBeInstanceOf(Date);
    });
  });
});
