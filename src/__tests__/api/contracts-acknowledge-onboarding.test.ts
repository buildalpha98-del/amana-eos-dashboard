import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })
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

import { POST } from "@/app/api/contracts/[id]/acknowledge/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("POST /api/contracts/[id]/acknowledge - onboarding seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    // Default: user with service, active (server-auth checks this)
    prismaMock.user.findUnique.mockResolvedValue({ active: true, serviceId: "s-1" });
  });

  it("seeds StaffOnboarding on first ack", async () => {
    mockSession({ id: "u-1", role: "staff", name: "Test" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "c-1",
      userId: "u-1",
      contractType: "ct_permanent",
      acknowledgedByStaff: false,
    });
    prismaMock.employmentContract.update.mockResolvedValue({
      id: "c-1",
      user: { id: "u-1", name: "T", email: "t@t", avatar: null },
    });
    prismaMock.onboardingPack.findFirst.mockResolvedValueOnce({
      id: "p-1",
      name: "New Educator Induction",
    });
    prismaMock.staffOnboarding.findUnique.mockResolvedValueOnce(null);
    prismaMock.staffOnboarding.create.mockResolvedValueOnce({ id: "o-1" });

    const req = createRequest("POST", "/api/contracts/c-1/acknowledge");
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    expect(prismaMock.staffOnboarding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u-1", packId: "p-1" }),
      })
    );
  });

  it("does not duplicate StaffOnboarding when pack already assigned", async () => {
    mockSession({ id: "u-1", role: "staff", name: "Test" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "c-1",
      userId: "u-1",
      contractType: "ct_permanent",
      acknowledgedByStaff: false,
    });
    prismaMock.employmentContract.update.mockResolvedValue({
      id: "c-1",
      user: { id: "u-1", name: "T", email: "t@t", avatar: null },
    });
    prismaMock.onboardingPack.findFirst.mockResolvedValueOnce({
      id: "p-1",
      name: "New Educator Induction",
    });
    prismaMock.staffOnboarding.findUnique.mockResolvedValueOnce({
      id: "o-existing",
      packId: "p-1",
      userId: "u-1",
    });

    const req = createRequest("POST", "/api/contracts/c-1/acknowledge");
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    expect(prismaMock.staffOnboarding.create).not.toHaveBeenCalled();
  });

  it("falls back to service default pack when no type-specific pack exists", async () => {
    mockSession({ id: "u-1", role: "staff", name: "Test" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "c-1",
      userId: "u-1",
      contractType: "ct_casual",
      acknowledgedByStaff: false,
    });
    prismaMock.employmentContract.update.mockResolvedValue({
      id: "c-1",
      user: { id: "u-1", name: "T", email: "t@t", avatar: null },
    });
    // First findFirst (by name) returns null; second (service default) returns the fallback
    prismaMock.onboardingPack.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "p-default", name: "Service Default" });
    prismaMock.staffOnboarding.findUnique.mockResolvedValueOnce(null);
    prismaMock.staffOnboarding.create.mockResolvedValueOnce({ id: "o-1" });

    const req = createRequest("POST", "/api/contracts/c-1/acknowledge");
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    expect(prismaMock.staffOnboarding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ packId: "p-default" }),
      })
    );
  });

  it("returns 200 and logs warn when no pack resolvable (head-office, no service, no global default)", async () => {
    mockSession({ id: "u-head", role: "head_office", name: "Head" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true, serviceId: null });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "c-head",
      userId: "u-head",
      contractType: "ct_permanent",
      acknowledgedByStaff: false,
    });
    prismaMock.employmentContract.update.mockResolvedValue({
      id: "c-head",
      user: { id: "u-head", name: "H", email: "h@h", avatar: null },
    });
    // Both by-name AND global default return null
    prismaMock.onboardingPack.findFirst
      .mockResolvedValueOnce(null) // by name
      .mockResolvedValueOnce(null); // global default (no service so skip service-default branch)

    const req = createRequest("POST", "/api/contracts/c-head/acknowledge");
    const res = await POST(req, { params: Promise.resolve({ id: "c-head" }) });
    expect(res.status).toBe(200); // does NOT fail the ack
    expect(prismaMock.staffOnboarding.create).not.toHaveBeenCalled();
  });
});
