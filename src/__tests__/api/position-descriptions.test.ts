/**
 * Auth + visibility tests for /api/position-descriptions and the
 * /api/users/[id]/position-description assignment endpoint.
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

import { GET, POST } from "@/app/api/position-descriptions/route";
import {
  GET as GET_ONE,
  PATCH,
  DELETE,
} from "@/app/api/position-descriptions/[id]/route";
import {
  GET as ASSIGN_GET,
  PUT as ASSIGN_PUT,
} from "@/app/api/users/[id]/position-description/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const basePd = {
  id: "pd-1",
  title: "Lead Educator",
  summary: "Leads the learning programme.",
  responsibilities: "...",
  selectionCriteria: "...",
  qualifications: "...",
  targetRole: "staff",
  status: "published",
  publishedAt: new Date(),
  archivedAt: null,
  createdById: "admin-1",
  createdBy: { id: "admin-1", name: "Admin" },
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { assignedUsers: 0 },
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

describe("GET /api/position-descriptions", () => {
  it("rejects unauthenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/position-descriptions"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(401);
  });

  it("staff see only published items by default", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    prismaMock.positionDescription.findMany.mockResolvedValue([basePd]);
    const res = await GET(
      createRequest("GET", "/api/position-descriptions"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const call = prismaMock.positionDescription.findMany.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ status: "published" });
  });

  it("admin sees all statuses", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.positionDescription.findMany.mockResolvedValue([basePd]);
    await GET(
      createRequest("GET", "/api/position-descriptions"),
      { params: Promise.resolve({}) },
    );
    const call = prismaMock.positionDescription.findMany.mock.calls[0]?.[0];
    expect(call?.where).toEqual({});
  });

  it("mine=1 returns null for draft PDs even if assigned", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      // server-auth check
      active: true,
      serviceId: "svc-1",
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      positionDescription: { ...basePd, status: "draft" },
      positionDescriptionAssignedAt: new Date(),
    });
    const res = await GET(
      createRequest("GET", "/api/position-descriptions?mine=1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.positionDescription).toBeNull();
  });
});

describe("POST /api/position-descriptions", () => {
  it("rejects staff", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    const res = await POST(
      createRequest("POST", "/api/position-descriptions", {
        body: {
          title: "T",
          summary: "s",
          responsibilities: "r",
          selectionCriteria: "sc",
          qualifications: "q",
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
  });

  it("admin can create", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.positionDescription.create.mockResolvedValue(basePd);
    const res = await POST(
      createRequest("POST", "/api/position-descriptions", {
        body: {
          title: "Lead Educator",
          summary: "Leads the learning programme.",
          responsibilities: "...",
          selectionCriteria: "...",
          qualifications: "...",
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/position-descriptions/[id]", () => {
  it("publishing for the first time stamps publishedAt", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.positionDescription.findUnique.mockResolvedValue({
      ...basePd,
      status: "draft",
      publishedAt: null,
    });
    prismaMock.positionDescription.update.mockResolvedValue(basePd);
    const res = await PATCH(
      createRequest("PATCH", "/api/position-descriptions/pd-1", {
        body: { status: "published" },
      }),
      { params: Promise.resolve({ id: "pd-1" }) },
    );
    expect(res.status).toBe(200);
    const call = prismaMock.positionDescription.update.mock.calls[0]?.[0];
    expect(call?.data.publishedAt).toBeInstanceOf(Date);
  });

  it("archiving stamps archivedAt", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.positionDescription.findUnique.mockResolvedValue(basePd);
    prismaMock.positionDescription.update.mockResolvedValue({
      ...basePd,
      status: "archived",
    });
    await PATCH(
      createRequest("PATCH", "/api/position-descriptions/pd-1", {
        body: { status: "archived" },
      }),
      { params: Promise.resolve({ id: "pd-1" }) },
    );
    const call = prismaMock.positionDescription.update.mock.calls[0]?.[0];
    expect(call?.data.archivedAt).toBeInstanceOf(Date);
  });
});

describe("DELETE /api/position-descriptions/[id]", () => {
  it("admin (non-owner) cannot delete", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await DELETE(
      createRequest("DELETE", "/api/position-descriptions/pd-1"),
      { params: Promise.resolve({ id: "pd-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("owner cannot delete with assigned users", async () => {
    mockSession({ id: "owner-1", name: "Owner", role: "owner" });
    prismaMock.positionDescription.findUnique.mockResolvedValue({
      ...basePd,
      _count: { assignedUsers: 3 },
    });
    const res = await DELETE(
      createRequest("DELETE", "/api/position-descriptions/pd-1"),
      { params: Promise.resolve({ id: "pd-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("owner can delete when no users assigned", async () => {
    mockSession({ id: "owner-1", name: "Owner", role: "owner" });
    prismaMock.positionDescription.findUnique.mockResolvedValue({
      ...basePd,
      _count: { assignedUsers: 0 },
    });
    prismaMock.positionDescription.delete.mockResolvedValue(basePd);
    const res = await DELETE(
      createRequest("DELETE", "/api/position-descriptions/pd-1"),
      { params: Promise.resolve({ id: "pd-1" }) },
    );
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/users/[id]/position-description", () => {
  it("rejects staff", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    const res = await ASSIGN_PUT(
      createRequest("PUT", "/api/users/u1/position-description", {
        body: { positionDescriptionId: "pd-1" },
      }),
      { params: Promise.resolve({ id: "u1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("admin can assign a published PD", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      // server-auth active check
      active: true,
      serviceId: "svc-1",
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "u1",
      name: "Target",
      positionDescriptionId: null,
    });
    prismaMock.positionDescription.findUnique.mockResolvedValue({
      id: "pd-1",
      title: "Lead",
      status: "published",
    });
    prismaMock.user.update.mockResolvedValue({
      id: "u1",
      positionDescriptionId: "pd-1",
      positionDescriptionAssignedAt: new Date(),
      positionDescription: { id: "pd-1", title: "Lead", status: "published" },
    });
    const res = await ASSIGN_PUT(
      createRequest("PUT", "/api/users/u1/position-description", {
        body: { positionDescriptionId: "pd-1" },
      }),
      { params: Promise.resolve({ id: "u1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("admin cannot assign a draft PD", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      active: true,
      serviceId: "svc-1",
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "u1",
      name: "Target",
      positionDescriptionId: null,
    });
    prismaMock.positionDescription.findUnique.mockResolvedValue({
      id: "pd-1",
      title: "Lead",
      status: "draft",
    });
    const res = await ASSIGN_PUT(
      createRequest("PUT", "/api/users/u1/position-description", {
        body: { positionDescriptionId: "pd-1" },
      }),
      { params: Promise.resolve({ id: "u1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("GET — staff can read their own assignment", async () => {
    mockSession({ id: "u1", name: "Self", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      // server-auth check
      active: true,
      serviceId: "svc-1",
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      positionDescriptionId: "pd-1",
      positionDescriptionAssignedAt: new Date(),
      positionDescription: { ...basePd, status: "published" },
    });
    const res = await ASSIGN_GET(
      createRequest("GET", "/api/users/u1/position-description"),
      { params: Promise.resolve({ id: "u1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("GET — non-admin cannot read someone else's", async () => {
    mockSession({ id: "u2", name: "Other", role: "staff" });
    const res = await ASSIGN_GET(
      createRequest("GET", "/api/users/u1/position-description"),
      { params: Promise.resolve({ id: "u1" }) },
    );
    expect(res.status).toBe(403);
  });
});
