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
import { GET, POST } from "@/app/api/users/[id]/service-memberships/route";

async function ctx(id = "u-target") {
  return { params: Promise.resolve({ id }) };
}

describe("user service-memberships API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  describe("GET /api/users/[id]/service-memberships", () => {
    it("401 without session", async () => {
      mockNoSession();
      const res = await GET(
        createRequest("GET", "/api/users/u-target/service-memberships"),
        await ctx(),
      );
      expect(res.status).toBe(401);
    });

    it("403 when non-admin views another user's memberships", async () => {
      mockSession({
        id: "u-self",
        name: "Self",
        role: "staff",
        serviceId: "s1",
      });
      const res = await GET(
        createRequest("GET", "/api/users/u-target/service-memberships"),
        await ctx(),
      );
      expect(res.status).toBe(403);
    });

    it("non-admin can view their OWN memberships", async () => {
      mockSession({
        id: "u-target",
        name: "Self",
        role: "staff",
        serviceId: "s-primary",
      });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id?: string; userId_serviceId?: { userId: string; serviceId: string } } }) => {
        if (where.id === "u-target") {
          return Promise.resolve({
            id: "u-target",
            serviceId: "s-primary",
            active: true,
          });
        }
        return Promise.resolve({ active: true });
      });
      prismaMock.userServiceMembership.findMany.mockResolvedValue([
        {
          id: "m1",
          serviceId: "s-other",
          roleAtService: "Educator",
          accessLevel: "contributor",
          startDate: new Date("2026-03-01"),
          endDate: null,
          status: "active",
          service: { name: "Other Centre" },
        },
      ]);
      const res = await GET(
        createRequest("GET", "/api/users/u-target/service-memberships"),
        await ctx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.primaryServiceId).toBe("s-primary");
      expect(body.memberships).toHaveLength(1);
      expect(body.memberships[0].serviceName).toBe("Other Centre");
    });

    it("admin can view any user's memberships", async () => {
      mockSession({
        id: "admin-1",
        name: "A",
        role: "admin",
      });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id?: string; userId_serviceId?: { userId: string; serviceId: string } } }) => {
        if (where.id === "u-target") {
          return Promise.resolve({
            id: "u-target",
            serviceId: "s-primary",
            active: true,
          });
        }
        return Promise.resolve({ active: true });
      });
      prismaMock.userServiceMembership.findMany.mockResolvedValue([]);
      const res = await GET(
        createRequest("GET", "/api/users/u-target/service-memberships"),
        await ctx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.primaryServiceId).toBe("s-primary");
      expect(body.memberships).toEqual([]);
    });

    it("only returns active memberships", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id?: string; userId_serviceId?: { userId: string; serviceId: string } } }) => {
        if (where.id === "u-target") {
          return Promise.resolve({
            id: "u-target",
            serviceId: null,
            active: true,
          });
        }
        return Promise.resolve({ active: true });
      });
      prismaMock.userServiceMembership.findMany.mockResolvedValue([]);
      await GET(
        createRequest("GET", "/api/users/u-target/service-memberships"),
        await ctx(),
      );
      const call =
        prismaMock.userServiceMembership.findMany.mock.calls[0]?.[0];
      expect(call.where.status).toBe("active");
      expect(call.where.userId).toBe("u-target");
    });
  });

  describe("POST /api/users/[id]/service-memberships", () => {
    it("403 from non-admin", async () => {
      mockSession({ id: "u-self", name: "S", role: "member", serviceId: "s1" });
      const res = await POST(
        createRequest("POST", "/api/users/u-target/service-memberships", {
          body: {
            items: [
              {
                serviceId: "s2",
                roleAtService: "Educator",
                accessLevel: "contributor",
                startDate: "2026-05-14",
              },
            ],
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(403);
    });

    it("400 on empty items", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      const res = await POST(
        createRequest("POST", "/api/users/u-target/service-memberships", {
          body: { items: [] },
        }),
        await ctx(),
      );
      expect(res.status).toBe(400);
    });

    it("404 if target user not found", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id?: string; userId_serviceId?: { userId: string; serviceId: string } } }) => {
        if (where.id === "u-target") return Promise.resolve(null);
        return Promise.resolve({ active: true });
      });
      const res = await POST(
        createRequest("POST", "/api/users/u-target/service-memberships", {
          body: {
            items: [
              {
                serviceId: "s2",
                roleAtService: "Educator",
                accessLevel: "contributor",
                startDate: "2026-05-14",
              },
            ],
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(404);
    });

    it("bulk-creates memberships and skips already-primary entries", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id?: string; userId_serviceId?: { userId: string; serviceId: string } } }) => {
        if (where.id === "u-target") {
          return Promise.resolve({
            id: "u-target",
            serviceId: "s-primary",
            active: true,
          });
        }
        return Promise.resolve({ active: true });
      });
      prismaMock.userServiceMembership.findUnique.mockResolvedValue(null);
      prismaMock.userServiceMembership.create.mockImplementation(
        ({ data }: { data: { serviceId: string; userId: string; roleAtService: string; accessLevel: string } }) =>
          Promise.resolve({ id: `new-${data.serviceId}`, ...data }),
      );

      const res = await POST(
        createRequest("POST", "/api/users/u-target/service-memberships", {
          body: {
            items: [
              {
                serviceId: "s-primary",
                roleAtService: "Educator",
                accessLevel: "contributor",
                startDate: "2026-05-14",
              },
              {
                serviceId: "s-new",
                roleAtService: "Educator",
                accessLevel: "contributor",
                startDate: "2026-05-14",
              },
            ],
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.created).toHaveLength(1);
      expect(body.created[0].serviceId).toBe("s-new");
      expect(body.skipped).toHaveLength(1);
      expect(body.skipped[0].serviceId).toBe("s-primary");
      expect(body.skipped[0].reason).toBe("already_primary");
    });

    it("skips serviceIds where user already has active membership", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id?: string; userId_serviceId?: { userId: string; serviceId: string } } }) => {
        if (where.id === "u-target") {
          return Promise.resolve({
            id: "u-target",
            serviceId: null,
            active: true,
          });
        }
        return Promise.resolve({ active: true });
      });
      prismaMock.userServiceMembership.findUnique.mockImplementation(
        ({ where }: { where: { userId_serviceId: { userId: string; serviceId: string } } }) => {
          if (where.userId_serviceId.serviceId === "s-existing") {
            return Promise.resolve({ id: "m-existing", status: "active" });
          }
          return Promise.resolve(null);
        },
      );
      prismaMock.userServiceMembership.create.mockImplementation(
        ({ data }: { data: { serviceId: string; userId: string; roleAtService: string; accessLevel: string } }) =>
          Promise.resolve({ id: `new-${data.serviceId}`, ...data }),
      );

      const res = await POST(
        createRequest("POST", "/api/users/u-target/service-memberships", {
          body: {
            items: [
              {
                serviceId: "s-existing",
                roleAtService: "Educator",
                accessLevel: "contributor",
                startDate: "2026-05-14",
              },
              {
                serviceId: "s-fresh",
                roleAtService: "Educator",
                accessLevel: "contributor",
                startDate: "2026-05-14",
              },
            ],
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.created).toHaveLength(1);
      expect(body.created[0].serviceId).toBe("s-fresh");
      expect(body.skipped).toHaveLength(1);
      expect(body.skipped[0].reason).toBe("already_assigned");
    });

    it("reactivates an inactive membership row instead of creating new", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id?: string; userId_serviceId?: { userId: string; serviceId: string } } }) => {
        if (where.id === "u-target") {
          return Promise.resolve({
            id: "u-target",
            serviceId: null,
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
        serviceId: "s-old",
        status: "active",
      });

      const res = await POST(
        createRequest("POST", "/api/users/u-target/service-memberships", {
          body: {
            items: [
              {
                serviceId: "s-old",
                roleAtService: "Educator",
                accessLevel: "contributor",
                startDate: "2026-05-14",
              },
            ],
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.created).toHaveLength(1);
      expect(body.created[0].reactivated).toBe(true);
      expect(prismaMock.userServiceMembership.update).toHaveBeenCalled();
    });

    it("maps Prisma P2002 race to skipped (never 500)", async () => {
      mockSession({ id: "admin-1", name: "A", role: "admin" });
      prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id?: string; userId_serviceId?: { userId: string; serviceId: string } } }) => {
        if (where.id === "u-target") {
          return Promise.resolve({
            id: "u-target",
            serviceId: null,
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
        createRequest("POST", "/api/users/u-target/service-memberships", {
          body: {
            items: [
              {
                serviceId: "s-race",
                roleAtService: "Educator",
                accessLevel: "contributor",
                startDate: "2026-05-14",
              },
            ],
          },
        }),
        await ctx(),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.created).toHaveLength(0);
      expect(body.skipped).toHaveLength(1);
      expect(body.skipped[0].reason).toBe("already_assigned");
    });
  });
});
