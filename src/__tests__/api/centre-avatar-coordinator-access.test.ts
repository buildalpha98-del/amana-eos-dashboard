import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));

import { GET } from "@/app/api/centre-avatars/[serviceId]/route";
import { POST as POST_CHECKIN } from "@/app/api/centre-avatars/[serviceId]/check-ins/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("Centre Avatar — coordinator access (QOL #1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "coord-own")
        return { id: "coord-own", role: "member", active: true };
      if (args?.where?.id === "coord-other")
        return { id: "coord-other", role: "member", active: true };
      return null;
    });
  });

  describe("GET /api/centre-avatars/[serviceId]", () => {
    it("allows a coordinator to read their own service's Avatar", async () => {
      mockSession({
        id: "coord-own",
        name: "Own Coordinator",
        role: "member",
        serviceId: "svc-mine",
      });
      prismaMock.centreAvatar.findUnique.mockResolvedValue({
        id: "ca1",
        serviceId: "svc-mine",
        version: 1,
        snapshot: {},
        parentAvatar: {},
        programmeMix: {},
        assetLibrary: {},
        lastUpdatedAt: new Date(),
        lastUpdatedBy: null,
        lastReviewedAt: null,
        lastReviewedBy: null,
        lastFullReviewAt: null,
        lastOpenedAt: null,
        lastOpenedBy: null,
        service: { id: "svc-mine", name: "My Centre", state: "NSW" },
        insights: [],
        campaignLog: [],
        coordinatorCheckIns: [],
        schoolLiaisonLog: [],
        updateLog: [],
      });

      const ctx = { params: Promise.resolve({ serviceId: "svc-mine" }) };
      const res = await GET(
        createRequest("GET", "/api/centre-avatars/svc-mine"),
        ctx as any,
      );
      expect(res.status).toBe(200);
    });

    it("returns 403 when a coordinator tries to read a different service's Avatar", async () => {
      mockSession({
        id: "coord-other",
        name: "Other Coordinator",
        role: "member",
        serviceId: "svc-other",
      });

      const ctx = { params: Promise.resolve({ serviceId: "svc-mine" }) };
      const res = await GET(
        createRequest("GET", "/api/centre-avatars/svc-mine"),
        ctx as any,
      );
      expect(res.status).toBe(403);
      expect(prismaMock.centreAvatar.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/centre-avatars/[serviceId]/check-ins", () => {
    it("allows a coordinator to log a check-in for their own service", async () => {
      mockSession({
        id: "coord-own",
        name: "Own Coordinator",
        role: "member",
        serviceId: "svc-mine",
      });
      prismaMock.centreAvatar.findUnique.mockResolvedValue({ id: "ca1" });
      prismaMock.centreAvatarCoordinatorCheckIn.create.mockResolvedValue({
        id: "ci1",
        topicsDiscussed: "Pickup chaos",
      });
      prismaMock.centreAvatarUpdateLog.create.mockResolvedValue({});
      prismaMock.centreAvatar.update.mockResolvedValue({});

      const ctx = { params: Promise.resolve({ serviceId: "svc-mine" }) };
      const res = await POST_CHECKIN(
        createRequest("POST", "/api/centre-avatars/svc-mine/check-ins", {
          body: {
            occurredAt: "2026-04-25",
            topicsDiscussed: "Pickup chaos",
          },
        }),
        ctx as any,
      );
      expect(res.status).toBe(200);
    });

    it("returns 403 when a coordinator tries to write check-ins for a different service", async () => {
      mockSession({
        id: "coord-other",
        name: "Other Coordinator",
        role: "member",
        serviceId: "svc-other",
      });

      const ctx = { params: Promise.resolve({ serviceId: "svc-mine" }) };
      const res = await POST_CHECKIN(
        createRequest("POST", "/api/centre-avatars/svc-mine/check-ins", {
          body: {
            occurredAt: "2026-04-25",
            topicsDiscussed: "Pickup chaos",
          },
        }),
        ctx as any,
      );
      expect(res.status).toBe(403);
      expect(prismaMock.centreAvatarCoordinatorCheckIn.create).not.toHaveBeenCalled();
    });
  });
});
