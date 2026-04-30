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

import { POST as openPOST } from "@/app/api/centre-avatars/[serviceId]/open/route";
import { GET as gateGET } from "@/app/api/centre-avatars/[serviceId]/gate-status/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("/api/centre-avatars/[serviceId]/open + /gate-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "m1")
        return { id: "m1", role: "marketing", active: true };
      return null;
    });
  });

  it("POST /open returns 404 when Avatar does not exist", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.centreAvatar.findUnique.mockResolvedValue(null);

    const ctx = { params: Promise.resolve({ serviceId: "missing" }) };
    const res = await openPOST(
      createRequest("POST", "/api/centre-avatars/missing/open"),
      ctx as any,
    );
    expect(res.status).toBe(404);
  });

  it("POST /open stamps lastOpenedAt + lastOpenedById", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.centreAvatar.findUnique.mockResolvedValue({ id: "ca1" });
    prismaMock.centreAvatar.update.mockResolvedValue({});

    const ctx = { params: Promise.resolve({ serviceId: "svc1" }) };
    const res = await openPOST(
      createRequest("POST", "/api/centre-avatars/svc1/open"),
      ctx as any,
    );
    expect(res.status).toBe(200);
    const calls = prismaMock.centreAvatar.update.mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toMatchObject({
      where: { id: "ca1" },
      data: expect.objectContaining({ lastOpenedById: "m1" }),
    });
  });

  it("GET /gate-status returns open=true when opened by user within 7 days", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.centreAvatar.findUnique.mockResolvedValue({
      id: "ca1",
      serviceId: "svc1",
      lastOpenedAt: new Date(Date.now() - 2 * 86_400_000),
      lastOpenedById: "m1",
      service: { id: "svc1", name: "Greystanes" },
      lastOpenedBy: { id: "m1", name: "Akram" },
    });

    const ctx = { params: Promise.resolve({ serviceId: "svc1" }) };
    const res = await gateGET(
      createRequest("GET", "/api/centre-avatars/svc1/gate-status"),
      ctx as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.open).toBe(true);
    expect(body.requiresReview).toBe(false);
  });

  it("GET /gate-status returns open=false when opened by a different user", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.centreAvatar.findUnique.mockResolvedValue({
      id: "ca1",
      serviceId: "svc1",
      lastOpenedAt: new Date(Date.now() - 2 * 86_400_000),
      lastOpenedById: "other",
      service: { id: "svc1", name: "Greystanes" },
      lastOpenedBy: { id: "other", name: "Someone" },
    });

    const ctx = { params: Promise.resolve({ serviceId: "svc1" }) };
    const res = await gateGET(
      createRequest("GET", "/api/centre-avatars/svc1/gate-status"),
      ctx as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.open).toBe(false);
    expect(body.requiresReview).toBe(true);
  });

  it("GET /gate-status returns open=false when opened >7 days ago", async () => {
    mockSession({ id: "m1", name: "Akram", role: "marketing" });
    prismaMock.centreAvatar.findUnique.mockResolvedValue({
      id: "ca1",
      serviceId: "svc1",
      lastOpenedAt: new Date(Date.now() - 10 * 86_400_000),
      lastOpenedById: "m1",
      service: { id: "svc1", name: "Greystanes" },
      lastOpenedBy: { id: "m1", name: "Akram" },
    });

    const ctx = { params: Promise.resolve({ serviceId: "svc1" }) };
    const res = await gateGET(
      createRequest("GET", "/api/centre-avatars/svc1/gate-status"),
      ctx as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.open).toBe(false);
  });
});
