/**
 * Access matrix tests for PATCH /api/compliance/[id].
 *
 * After widening (matches the GET /download route):
 *   - Own cert (userId === viewerId): allowed
 *   - Admin (owner/head_office/admin): allowed
 *   - Coordinator in same service as cert: allowed
 *   - Coordinator in a different service: 403
 *   - Staff viewing someone else's cert: 403
 *   - Unauthenticated: 401
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

import { PATCH } from "@/app/api/compliance/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

function callPatch(certId: string, body: Record<string, unknown>) {
  const req = createRequest("PATCH", `/api/compliance/${certId}`, { body });
  return PATCH(req, { params: Promise.resolve({ id: certId }) });
}

describe("PATCH /api/compliance/[id] — widened auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id) return { active: true, serviceId: "svc-1" };
      return null;
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await callPatch("cert-1", { notes: "x" });
    expect(res.status).toBe(401);
  });

  it("allows the cert owner to PATCH their own cert", async () => {
    mockSession({ id: "user-1", name: "Staff", role: "staff" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-1",
      serviceId: "svc-1",
      fileUrl: null,
    });
    prismaMock.complianceCertificate.update.mockResolvedValue({ id: "cert-1", notes: "x" });
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-1") return { active: true, serviceId: "svc-1" };
      return null;
    });

    const res = await callPatch("cert-1", { notes: "x" });
    expect(res.status).toBe(200);
  });

  it("allows an admin to PATCH any cert", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-99",
      serviceId: "svc-9",
      fileUrl: null,
    });
    prismaMock.complianceCertificate.update.mockResolvedValue({ id: "cert-1", notes: "x" });
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "admin-1") return { active: true, serviceId: null };
      return null;
    });

    const res = await callPatch("cert-1", { notes: "x" });
    expect(res.status).toBe(200);
  });

  it("allows a coordinator in the same service to PATCH", async () => {
    mockSession({ id: "coord-1", name: "Coord", role: "member", serviceId: "svc-1" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-99",
      serviceId: "svc-1",
      fileUrl: null,
    });
    prismaMock.complianceCertificate.update.mockResolvedValue({ id: "cert-1", notes: "x" });
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "coord-1") return { active: true, serviceId: "svc-1" };
      return null;
    });

    const res = await callPatch("cert-1", { notes: "x" });
    expect(res.status).toBe(200);
  });

  it("rejects a coordinator in a different service with 403", async () => {
    mockSession({ id: "coord-1", name: "Coord", role: "member", serviceId: "svc-OTHER" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-99",
      serviceId: "svc-1",
      fileUrl: null,
    });
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "coord-1") return { active: true, serviceId: "svc-OTHER" };
      return null;
    });

    const res = await callPatch("cert-1", { notes: "x" });
    expect(res.status).toBe(403);
  });

  it("rejects staff editing someone else's cert with 403", async () => {
    mockSession({ id: "user-1", name: "Staff", role: "staff" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-99",
      serviceId: "svc-1",
      fileUrl: null,
    });

    const res = await callPatch("cert-1", { notes: "x" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when cert does not exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue(null);

    const res = await callPatch("missing", { notes: "x" });
    expect(res.status).toBe(404);
  });
});
