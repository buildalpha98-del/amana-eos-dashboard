import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/app/api/_lib/auth", () => ({
  authenticateCowork: vi.fn(() => null),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(() => "$2a$12$hashed") },
  hash: vi.fn(() => "$2a$12$hashed"),
}));

vi.mock("@/lib/notification-defaults", () => ({
  getDefaultNotificationPrefs: vi.fn(() => ({})),
}));

const { POST } = await import("@/app/api/cowork/staff/sync/route");

describe("POST /api/cowork/staff/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.service.findMany.mockResolvedValue([]);
  });

  it("returns 400 on empty staff array", async () => {
    const req = createRequest("POST", "/api/cowork/staff/sync", {
      body: { staff: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates new users with mapped role", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: "u1" } as any);

    const req = createRequest("POST", "/api/cowork/staff/sync", {
      body: { staff: [{ name: "Jane Doe", email: "jane@example.com", role: "member" }] },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "member" }) })
    );
  });

  it("does NOT downgrade an owner's role via sync", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "daniel@amanaoshc.com.au",
      role: "owner",
      state: null,
      serviceId: null,
      phone: null,
      active: true,
    } as any);
    prismaMock.user.update.mockResolvedValue({ id: "u1" } as any);

    const req = createRequest("POST", "/api/cowork/staff/sync", {
      body: {
        staff: [{ name: "Daniel", email: "daniel@amanaoshc.com.au", role: "admin" }],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Role must stay as "owner", not be overwritten to "admin"
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "owner" }),
      })
    );
  });

  it("does NOT downgrade a head_office role via sync", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u2",
      email: "hq@amanaoshc.com.au",
      role: "head_office",
      state: null,
      serviceId: null,
      phone: null,
      active: true,
    } as any);
    prismaMock.user.update.mockResolvedValue({ id: "u2" } as any);

    const req = createRequest("POST", "/api/cowork/staff/sync", {
      body: {
        staff: [{ name: "HQ User", email: "hq@amanaoshc.com.au", role: "staff" }],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "head_office" }),
      })
    );
  });

  it("does update role for non-privileged users", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u3",
      email: "staff@example.com",
      role: "staff",
      state: null,
      serviceId: null,
      phone: null,
      active: true,
    } as any);
    prismaMock.user.update.mockResolvedValue({ id: "u3" } as any);

    const req = createRequest("POST", "/api/cowork/staff/sync", {
      body: {
        staff: [{ name: "Jane Staff", email: "staff@example.com", role: "member" }],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "member" }),
      })
    );
  });
});
