/**
 * Auth tests for /api/reference-checks.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

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
  generateRequestId: () => "test-req",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { GET, POST } from "@/app/api/reference-checks/route";
import { DELETE } from "@/app/api/reference-checks/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const baseCheck = {
  id: "ref-1",
  userId: "subject-1",
  checkedById: "admin-1",
  refereeName: "Jane Smith",
  refereeRelationship: "Former manager",
  refereeOrganisation: "OWNA",
  refereePhone: null,
  refereeEmail: null,
  method: "phone",
  contactedAt: new Date(),
  status: "completed",
  recommendation: "positive",
  notes: "Solid worker.",
  redFlags: null,
  employmentVerified: true,
  wouldRehire: true,
  deleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: "subject-1", name: "Subject" },
  checkedBy: { id: "admin-1", name: "Admin" },
};

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({
    active: true,
    serviceId: "svc-1",
  });
  prismaMock.activityLog.create.mockResolvedValue({} as never);
});

describe("GET /api/reference-checks", () => {
  it("rejects unauthenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/reference-checks?userId=subject-1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(401);
  });

  it("rejects staff", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    const res = await GET(
      createRequest("GET", "/api/reference-checks?userId=subject-1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
  });

  it("rejects member (Director of Service)", async () => {
    mockSession({ id: "m-1", name: "DoS", role: "member" });
    const res = await GET(
      createRequest("GET", "/api/reference-checks?userId=subject-1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
  });

  it("admin can list", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.referenceCheck.findMany.mockResolvedValue([baseCheck]);
    const res = await GET(
      createRequest("GET", "/api/reference-checks?userId=subject-1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 without userId", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/reference-checks"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/reference-checks", () => {
  beforeEach(() => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      active: true,
      serviceId: "svc-1",
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "subject-1",
      name: "Subject",
    });
    prismaMock.referenceCheck.create.mockResolvedValue(baseCheck);
  });

  it("creates + logs activity", async () => {
    const res = await POST(
      createRequest("POST", "/api/reference-checks", {
        body: {
          userId: "subject-1",
          refereeName: "Jane",
          refereeRelationship: "Manager",
          method: "phone",
          notes: "Test",
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
  });

  it("rejects without notes", async () => {
    const res = await POST(
      createRequest("POST", "/api/reference-checks", {
        body: {
          userId: "subject-1",
          refereeName: "Jane",
          refereeRelationship: "Manager",
          method: "phone",
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/reference-checks/[id]", () => {
  it("admin cannot delete", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await DELETE(
      createRequest("DELETE", "/api/reference-checks/ref-1"),
      { params: Promise.resolve({ id: "ref-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("owner can soft-delete", async () => {
    mockSession({ id: "owner-1", name: "Owner", role: "owner" });
    prismaMock.referenceCheck.findUnique.mockResolvedValue(baseCheck);
    prismaMock.referenceCheck.update.mockResolvedValue({
      ...baseCheck,
      deleted: true,
    });
    const res = await DELETE(
      createRequest("DELETE", "/api/reference-checks/ref-1"),
      { params: Promise.resolve({ id: "ref-1" }) },
    );
    expect(res.status).toBe(200);
    const update = prismaMock.referenceCheck.update.mock.calls[0]?.[0];
    expect(update?.data.deleted).toBe(true);
  });
});
