/**
 * POST + PATCH /api/compliance — null expiry + past-date validation.
 *
 * Coverage for the schema-nullable-expiry change:
 *   - POST with expiryDate=null → 201, cert stored with expiryDate null
 *   - POST with expiryDate omitted → 201, treated as null
 *   - POST with expiryDate in the past → 400 with friendly message
 *   - POST with expiryDate=today → 201 (boundary)
 *   - PATCH with expiryDate=null → 200, cert's expiry cleared
 *   - PATCH with expiryDate=""  → 200, also cleared (form submitting empty)
 *   - PATCH with expiryDate in the past → 400
 *   - PATCH with expiryDate unchanged-not-supplied → no overwrite
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
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("@/lib/storage", () => ({
  uploadFile: vi.fn(() => Promise.resolve({ url: "https://blob/new.pdf" })),
  deleteFile: vi.fn(() => Promise.resolve()),
}));

import { POST } from "@/app/api/compliance/route";
import { PATCH } from "@/app/api/compliance/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoOffsetDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function callPost(body: Record<string, unknown>) {
  return POST(createRequest("POST", "/api/compliance", { body }), {
    params: Promise.resolve({}),
  });
}
function callPatch(id: string, body: Record<string, unknown>) {
  return PATCH(createRequest("PATCH", `/api/compliance/${id}`, { body }), {
    params: Promise.resolve({ id }),
  });
}

const VALID_BASE = {
  serviceId: "svc-1",
  userId: "user-1",
  type: "wwcc",
  label: "WWCC",
  issueDate: todayIso(),
};

describe("POST /api/compliance — nullable expiry + past-date", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true, serviceId: "svc-1" });
    prismaMock.complianceCertificate.create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "cert-new", ...args.data }),
    );
    prismaMock.activityLog.create.mockResolvedValue({} as never);
  });

  it("accepts expiryDate=null and stores it as null on the new cert", async () => {
    const res = await callPost({ ...VALID_BASE, expiryDate: null });
    expect(res.status).toBe(201);
    const createCall = prismaMock.complianceCertificate.create.mock.calls[0]?.[0] as { data: { expiryDate: Date | null } };
    expect(createCall.data.expiryDate).toBeNull();
  });

  it("accepts expiryDate omitted entirely (no-expiry path)", async () => {
    const { ...withoutExpiry } = VALID_BASE;
    const res = await callPost(withoutExpiry);
    expect(res.status).toBe(201);
    const createCall = prismaMock.complianceCertificate.create.mock.calls[0]?.[0] as { data: { expiryDate: Date | null } };
    expect(createCall.data.expiryDate).toBeNull();
  });

  it("accepts expiryDate=today (boundary — same day is still valid)", async () => {
    const res = await callPost({ ...VALID_BASE, expiryDate: todayIso() });
    expect(res.status).toBe(201);
  });

  it("rejects expiryDate in the past with a clear message", async () => {
    const res = await callPost({ ...VALID_BASE, expiryDate: isoOffsetDays(-1) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/past/i);
  });
});

describe("PATCH /api/compliance/[id] — clearing expiry + past-date", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true, serviceId: "svc-1" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-1",
      serviceId: "svc-1",
      fileUrl: null,
    });
    prismaMock.complianceCertificate.update.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "cert-1", ...args.data }),
    );
    prismaMock.activityLog.create.mockResolvedValue({} as never);
  });

  it("expiryDate=null clears the column", async () => {
    const res = await callPatch("cert-1", { expiryDate: null });
    expect(res.status).toBe(200);
    const updateCall = prismaMock.complianceCertificate.update.mock.calls[0]?.[0] as { data: { expiryDate?: Date | null } };
    expect(updateCall.data.expiryDate).toBeNull();
  });

  it("expiryDate='' clears the column (form-submitted empty string)", async () => {
    const res = await callPatch("cert-1", { expiryDate: "" });
    expect(res.status).toBe(200);
    const updateCall = prismaMock.complianceCertificate.update.mock.calls[0]?.[0] as { data: { expiryDate?: Date | null } };
    expect(updateCall.data.expiryDate).toBeNull();
  });

  it("expiryDate in the past → 400", async () => {
    const res = await callPatch("cert-1", { expiryDate: isoOffsetDays(-7) });
    expect(res.status).toBe(400);
  });

  it("omitting expiryDate doesn't touch the column", async () => {
    const res = await callPatch("cert-1", { notes: "tweak" });
    expect(res.status).toBe(200);
    const updateCall = prismaMock.complianceCertificate.update.mock.calls[0]?.[0] as { data: { expiryDate?: Date | null } };
    expect(updateCall.data.expiryDate).toBeUndefined();
  });
});
