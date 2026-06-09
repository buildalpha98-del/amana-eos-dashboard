/**
 * Regression tests for the 2026-06-05 compliance cleanups:
 *
 * 1. POST /api/compliance no longer 400s "Service ID is required"
 *    when a staff member has no service assigned. The cert lands
 *    with serviceId=null (the column was relaxed to nullable in
 *    the matching migration) and userId set to the caller. Personal
 *    certs are anchored on userId.
 *
 * 2. GET /api/compliance?scope=self forces a strict userId=self
 *    filter regardless of role — closes the leakage where a
 *    `member` (OSHC Coordinator) saw service-wide certs (including
 *    other staff's WWCCs) on their *own* compliance page.
 *
 * 3. POST notifies admins when a non-admin uploads a cert with an
 *    attached file. Skips when the uploader is admin or the upload
 *    is metadata-only (no fileUrl).
 */
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
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("@/lib/storage", () => ({
  uploadFile: vi.fn(() => Promise.resolve({ url: "https://blob/new.pdf" })),
}));

import { GET, POST } from "@/app/api/compliance/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("POST /api/compliance — personal cert (no serviceId)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.complianceCertificate.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "cert-new", ...args.data }),
    );
    prismaMock.activityLog.create.mockResolvedValue({} as never);
    prismaMock.userNotification.createMany.mockResolvedValue({
      count: 0,
    } as never);
  });

  it("creates a cert with serviceId=null when a staff member has no service", async () => {
    mockSession({
      id: "staff-no-svc",
      name: "Khawla",
      role: "staff",
      serviceId: null,
    });
    // First call: active check for the caller. Second: the staff lookup
    // that the route does when serviceId is missing from the session.
    prismaMock.user.findUnique.mockImplementation(
      async (args: { where: { id: string } }) => {
        if (args.where.id === "staff-no-svc") {
          return { active: true, serviceId: null };
        }
        return null;
      },
    );
    // No admins to notify in this test — skip the lookup payload.
    prismaMock.user.findMany.mockResolvedValue([]);

    const res = await POST(
      createRequest("POST", "/api/compliance", {
        body: {
          serviceId: null,
          type: "wwcc",
          label: "WWCC",
          issueDate: todayIso(),
          fileUrl: "https://blob/wwcc.pdf",
          fileName: "wwcc.pdf",
        },
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(201);
    const createCall =
      prismaMock.complianceCertificate.create.mock.calls[0]?.[0];
    expect(createCall.data.serviceId).toBeNull();
    expect(createCall.data.userId).toBe("staff-no-svc");
    expect(createCall.data.type).toBe("wwcc");
  });

  it("rejects when both userId and serviceId would end up null (anchorless)", async () => {
    // Admin uploading a cert without specifying either field. No anchor
    // for the row → must reject so we don't create orphans.
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    const res = await POST(
      createRequest("POST", "/api/compliance", {
        body: {
          serviceId: null,
          userId: null,
          type: "first_aid",
          issueDate: todayIso(),
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/staff member|service/i);
  });
});

describe("GET /api/compliance?scope=self — strict isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({
      active: true,
      serviceId: "svc-1",
    });
    prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
  });

  it("forces userId=self for a member viewer (was leaking service-wide)", async () => {
    mockSession({
      id: "khawla",
      name: "Khawla",
      role: "member",
      serviceId: "svc-1",
    });

    const res = await GET(
      createRequest("GET", "/api/compliance?scope=self"),
    );
    expect(res.status).toBe(200);

    const call = prismaMock.complianceCertificate.findMany.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ userId: "khawla" });
    expect(call?.where.serviceId).toBeUndefined();
  });

  it("default scope (no ?scope=self) still service-scopes member viewers", async () => {
    mockSession({
      id: "khawla",
      name: "Khawla",
      role: "member",
      serviceId: "svc-1",
    });

    await GET(createRequest("GET", "/api/compliance"));

    const call = prismaMock.complianceCertificate.findMany.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ serviceId: "svc-1" });
  });
});

describe("POST /api/compliance — admin notification on staff upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.complianceCertificate.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "cert-new",
          ...args.data,
          user: { id: "khawla", name: "Khawla", email: "k@x.com" },
        }),
    );
    prismaMock.activityLog.create.mockResolvedValue({} as never);
    prismaMock.userNotification.createMany.mockResolvedValue({
      count: 0,
    } as never);
  });

  it("pings admins when a staff member uploads with a file", async () => {
    mockSession({
      id: "khawla",
      name: "Khawla",
      role: "staff",
      serviceId: "svc-1",
    });
    prismaMock.user.findUnique.mockResolvedValue({
      active: true,
      serviceId: "svc-1",
    });
    prismaMock.user.findMany.mockResolvedValue([
      { id: "admin-1" },
      { id: "owner-1" },
    ]);

    await POST(
      createRequest("POST", "/api/compliance", {
        body: {
          serviceId: "svc-1",
          type: "wwcc",
          issueDate: todayIso(),
          fileUrl: "https://blob/wwcc.pdf",
        },
      }),
      { params: Promise.resolve({}) },
    );

    const call =
      prismaMock.userNotification.createMany.mock.calls[0]?.[0];
    expect(call?.data).toHaveLength(2);
    expect(call?.data[0].type).toBe("compliance_cert_uploaded");
  });

  it("skips the notification when an admin uploads (they don't ping themselves)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockImplementation(
      async (args: { where: { id: string } }) => {
        if (args.where.id === "admin-1") {
          return { active: true, serviceId: null };
        }
        return { id: "khawla", name: "Khawla", active: true };
      },
    );
    prismaMock.user.findMany.mockResolvedValue([{ id: "owner-1" }]);

    await POST(
      createRequest("POST", "/api/compliance", {
        body: {
          serviceId: "svc-1",
          userId: "khawla",
          type: "wwcc",
          issueDate: todayIso(),
          fileUrl: "https://blob/wwcc.pdf",
        },
      }),
      { params: Promise.resolve({}) },
    );

    expect(
      prismaMock.userNotification.createMany,
    ).not.toHaveBeenCalled();
  });

  it("skips the notification on metadata-only uploads (no fileUrl)", async () => {
    mockSession({
      id: "khawla",
      role: "staff",
      serviceId: "svc-1",
    });
    prismaMock.user.findUnique.mockResolvedValue({
      active: true,
      serviceId: "svc-1",
    });

    await POST(
      createRequest("POST", "/api/compliance", {
        body: {
          serviceId: "svc-1",
          type: "wwcc",
          issueDate: todayIso(),
          // No fileUrl — OWNA-stub style row
        },
      }),
      { params: Promise.resolve({}) },
    );

    expect(
      prismaMock.userNotification.createMany,
    ).not.toHaveBeenCalled();
  });
});
