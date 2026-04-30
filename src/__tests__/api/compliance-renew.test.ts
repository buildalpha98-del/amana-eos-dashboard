import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

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
vi.mock("@/lib/storage", () => ({
  uploadFile: vi.fn(() =>
    Promise.resolve({ url: "https://blob.example.com/cert.pdf", pathname: "cert.pdf" }),
  ),
}));

import { POST } from "@/app/api/compliance/[id]/renew/route";

const ctx = (params: Record<string, string>) => ({
  params: Promise.resolve(params),
});

const baseCert = {
  id: "cert-1",
  serviceId: "svc-1",
  userId: "u-target",
  type: "first_aid",
  label: "HLTAID011",
  issueDate: new Date("2023-04-01"),
  expiryDate: new Date("2026-04-01"),
  notes: null,
  fileUrl: null,
  fileName: null,
  alertDays: 30,
  acknowledged: false,
  previousCertificateId: null,
  supersededAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("POST /api/compliance/[id]/renew", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue(
      baseCert as never,
    );
    prismaMock.activityLog.create.mockResolvedValue({} as never);

    // $transaction returns the result of the inner callback; mock by running
    // the callback against the same prismaMock so create + update are tracked.
    prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
      if (typeof cb === "function") {
        return await (cb as (tx: typeof prismaMock) => Promise<unknown>)(
          prismaMock,
        );
      }
      return cb;
    });
    prismaMock.complianceCertificate.create.mockResolvedValue({
      ...baseCert,
      id: "cert-2",
      issueDate: new Date("2026-04-01"),
      expiryDate: new Date("2029-04-01"),
      previousCertificateId: "cert-1",
    } as never);
    prismaMock.complianceCertificate.update.mockResolvedValue({} as never);
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/compliance/cert-1/renew", {
      body: {
        issueDate: "2026-04-01T00:00:00.000Z",
        expiryDate: "2029-04-01T00:00:00.000Z",
      },
    });
    const res = await POST(req, ctx({ id: "cert-1" }));
    expect(res.status).toBe(401);
  });

  it("admin renewing → 201, creates chain link + supersedes predecessor", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest("POST", "/api/compliance/cert-1/renew", {
      body: {
        issueDate: "2026-04-01T00:00:00.000Z",
        expiryDate: "2029-04-01T00:00:00.000Z",
      },
    });
    const res = await POST(req, ctx({ id: "cert-1" }));
    expect(res.status).toBe(201);

    const createCall =
      prismaMock.complianceCertificate.create.mock.calls[0]?.[0];
    expect(createCall?.data?.previousCertificateId).toBe("cert-1");
    expect(createCall?.data?.serviceId).toBe("svc-1");
    expect(createCall?.data?.userId).toBe("u-target");
    expect(createCall?.data?.type).toBe("first_aid");

    const updateCall =
      prismaMock.complianceCertificate.update.mock.calls[0]?.[0];
    expect(updateCall?.where?.id).toBe("cert-1");
    expect(updateCall?.data?.supersededAt).toBeInstanceOf(Date);
  });

  it("staff renewing own cert → 201", async () => {
    mockSession({
      id: "u-target",
      name: "Self",
      role: "staff",
      serviceId: "svc-1",
    });
    const req = createRequest("POST", "/api/compliance/cert-1/renew", {
      body: {
        issueDate: "2026-04-01T00:00:00.000Z",
        expiryDate: "2029-04-01T00:00:00.000Z",
      },
    });
    const res = await POST(req, ctx({ id: "cert-1" }));
    expect(res.status).toBe(201);
  });

  it("staff renewing someone else's cert → 403", async () => {
    mockSession({
      id: "u-other",
      name: "Other",
      role: "staff",
      serviceId: "svc-1",
    });
    const req = createRequest("POST", "/api/compliance/cert-1/renew", {
      body: {
        issueDate: "2026-04-01T00:00:00.000Z",
        expiryDate: "2029-04-01T00:00:00.000Z",
      },
    });
    const res = await POST(req, ctx({ id: "cert-1" }));
    expect(res.status).toBe(403);
  });

  it("coordinator at different service → 403", async () => {
    mockSession({
      id: "u-coord",
      name: "Coord",
      role: "member",
      serviceId: "svc-other",
    });
    const req = createRequest("POST", "/api/compliance/cert-1/renew", {
      body: {
        issueDate: "2026-04-01T00:00:00.000Z",
        expiryDate: "2029-04-01T00:00:00.000Z",
      },
    });
    const res = await POST(req, ctx({ id: "cert-1" }));
    expect(res.status).toBe(403);
  });

  it("coordinator at same service → 201", async () => {
    mockSession({
      id: "u-coord",
      name: "Coord",
      role: "member",
      serviceId: "svc-1",
    });
    const req = createRequest("POST", "/api/compliance/cert-1/renew", {
      body: {
        issueDate: "2026-04-01T00:00:00.000Z",
        expiryDate: "2029-04-01T00:00:00.000Z",
      },
    });
    const res = await POST(req, ctx({ id: "cert-1" }));
    expect(res.status).toBe(201);
  });

  it("rejects renewal where new expiry is before old expiry (400)", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest("POST", "/api/compliance/cert-1/renew", {
      body: {
        issueDate: "2026-04-01T00:00:00.000Z",
        expiryDate: "2025-12-01T00:00:00.000Z", // earlier than baseCert.expiryDate
      },
    });
    const res = await POST(req, ctx({ id: "cert-1" }));
    expect(res.status).toBe(400);
  });

  it("rejects renewal where expiry is before issue (400)", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest("POST", "/api/compliance/cert-1/renew", {
      body: {
        issueDate: "2026-04-01T00:00:00.000Z",
        expiryDate: "2026-03-01T00:00:00.000Z",
      },
    });
    const res = await POST(req, ctx({ id: "cert-1" }));
    expect(res.status).toBe(400);
  });

  it("rejects renewing an already-superseded cert (400)", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      ...baseCert,
      supersededAt: new Date("2026-01-01"),
    } as never);
    const req = createRequest("POST", "/api/compliance/cert-1/renew", {
      body: {
        issueDate: "2026-04-01T00:00:00.000Z",
        expiryDate: "2029-04-01T00:00:00.000Z",
      },
    });
    const res = await POST(req, ctx({ id: "cert-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when cert does not exist", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue(null);
    const req = createRequest("POST", "/api/compliance/missing/renew", {
      body: {
        issueDate: "2026-04-01T00:00:00.000Z",
        expiryDate: "2029-04-01T00:00:00.000Z",
      },
    });
    const res = await POST(req, ctx({ id: "missing" }));
    expect(res.status).toBe(404);
  });

  it("logs renewal action with chain metadata", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest("POST", "/api/compliance/cert-1/renew", {
      body: {
        issueDate: "2026-04-01T00:00:00.000Z",
        expiryDate: "2029-04-01T00:00:00.000Z",
      },
    });
    await POST(req, ctx({ id: "cert-1" }));
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "renew",
          entityType: "ComplianceCertificate",
          details: expect.objectContaining({
            previousCertificateId: "cert-1",
            forUserId: "u-target",
          }),
        }),
      }),
    );
  });
});
