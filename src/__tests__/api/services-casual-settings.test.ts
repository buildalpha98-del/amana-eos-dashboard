import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock api-error (used by services/[id]/casual-settings)
vi.mock("@/lib/api-error", async () => {
  const actual = await vi.importActual("@/lib/api-error");
  return actual;
});

// Mock logger + rate limit
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

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

import { PATCH } from "@/app/api/services/[id]/casual-settings/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const validBlob = {
  bsc: {
    enabled: true,
    fee: 36.0,
    spots: 10,
    cutOffHours: 24,
    days: ["mon", "tue", "wed", "thu", "fri"],
  },
  asc: {
    enabled: false,
    fee: 0,
    spots: 0,
    cutOffHours: 24,
    days: [],
  },
  vc: {
    enabled: false,
    fee: 0,
    spots: 0,
    cutOffHours: 24,
    days: [],
  },
};

describe("PATCH /api/services/[id]/casual-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();

    const req = createRequest(
      "PATCH",
      "/api/services/svc-1/casual-settings",
      { body: validBlob },
    );
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(401);
    expect(prismaMock.service.update).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin non-coord roles (staff)", async () => {
    mockSession({ id: "user-staff", name: "Staff", role: "staff" });

    const req = createRequest(
      "PATCH",
      "/api/services/svc-1/casual-settings",
      { body: validBlob },
    );
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(403);
    expect(prismaMock.service.update).not.toHaveBeenCalled();
  });

  it("returns 403 for member role", async () => {
    mockSession({ id: "user-m", name: "Member", role: "member" });

    const req = createRequest(
      "PATCH",
      "/api/services/svc-1/casual-settings",
      { body: validBlob },
    );
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(403);
    expect(prismaMock.service.update).not.toHaveBeenCalled();
  });

  it("returns 403 when coordinator's serviceId differs from target", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "member",
      serviceId: "svc-other",
    });

    const req = createRequest(
      "PATCH",
      "/api/services/svc-1/casual-settings",
      { body: validBlob },
    );
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(403);
    expect(prismaMock.service.update).not.toHaveBeenCalled();
  });

  it("allows coordinator on their own service to save settings (200)", async () => {
    mockSession({
      id: "coord-1",
      name: "Coord",
      role: "member",
      serviceId: "svc-1",
    });

    prismaMock.service.update.mockResolvedValue({
      id: "svc-1",
      casualBookingSettings: validBlob,
    });

    const req = createRequest(
      "PATCH",
      "/api/services/svc-1/casual-settings",
      { body: validBlob },
    );
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);
    expect(prismaMock.service.update).toHaveBeenCalledTimes(1);

    const call = prismaMock.service.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "svc-1" });
    expect(call.data.casualBookingSettings).toEqual(validBlob);
  });

  it("allows admin to save settings for any service (200)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    prismaMock.service.update.mockResolvedValue({
      id: "svc-1",
      casualBookingSettings: validBlob,
    });

    const req = createRequest(
      "PATCH",
      "/api/services/svc-1/casual-settings",
      { body: validBlob },
    );
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);
    expect(prismaMock.service.update).toHaveBeenCalledTimes(1);
  });

  it("allows owner to save settings for any service (200)", async () => {
    mockSession({ id: "owner-1", name: "Owner", role: "owner" });

    prismaMock.service.update.mockResolvedValue({
      id: "svc-1",
      casualBookingSettings: validBlob,
    });

    const req = createRequest(
      "PATCH",
      "/api/services/svc-1/casual-settings",
      { body: validBlob },
    );
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBeDefined();
    expect(body.service.id).toBe("svc-1");
  });

  it("returns 400 for malformed body (bad day enum)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    const req = createRequest(
      "PATCH",
      "/api/services/svc-1/casual-settings",
      {
        body: {
          bsc: {
            enabled: true,
            fee: 10,
            spots: 5,
            cutOffHours: 24,
            days: ["notaday"],
          },
        },
      },
    );
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(400);
    expect(prismaMock.service.update).not.toHaveBeenCalled();
  });

  it("returns 400 for negative fee", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    const req = createRequest(
      "PATCH",
      "/api/services/svc-1/casual-settings",
      {
        body: {
          bsc: {
            enabled: true,
            fee: -5,
            spots: 5,
            cutOffHours: 24,
            days: ["mon"],
          },
        },
      },
    );
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(400);
    expect(prismaMock.service.update).not.toHaveBeenCalled();
  });

  it("returns 400 when spots is not an integer", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    const req = createRequest(
      "PATCH",
      "/api/services/svc-1/casual-settings",
      {
        body: {
          bsc: {
            enabled: true,
            fee: 10,
            spots: 3.5,
            cutOffHours: 24,
            days: ["mon"],
          },
        },
      },
    );
    const context = { params: Promise.resolve({ id: "svc-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(400);
    expect(prismaMock.service.update).not.toHaveBeenCalled();
  });
});
