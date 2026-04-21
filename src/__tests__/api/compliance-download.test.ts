/**
 * Access matrix tests for GET /api/compliance/[id]/download.
 *
 * The route performs an access-checked redirect to the cert's blob URL. The
 * matrix:
 *   - Own cert (userId === viewerId): 302
 *   - Admin (owner/head_office/admin): 302
 *   - Coordinator in same service as cert: 302
 *   - Coordinator in a different service: 403
 *   - Staff viewing someone else's cert: 403
 *   - Missing file (fileUrl is null): 404
 *   - Not-found cert: 404
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Silence the structured logger
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

// No rate-limiting in tests
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

// Import AFTER mocks are set up
import { GET } from "@/app/api/compliance/[id]/download/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

function callRoute(certId: string) {
  const req = createRequest("GET", `/api/compliance/${certId}/download`);
  return GET(req, { params: Promise.resolve({ id: certId }) });
}

describe("GET /api/compliance/[id]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    // withApiAuth checks user is active in DB — default active
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await callRoute("cert-1");
    expect(res.status).toBe(401);
  });

  it("returns 302 for the cert owner", async () => {
    mockSession({ id: "user-1", name: "Owner User", role: "staff" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-1",
      serviceId: "svc-1",
      fileUrl: "https://blob.example.com/cert-1.pdf",
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "user-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("cert-1");
    expect(res.status).toBe(307); // NextResponse.redirect default is 307
    expect(res.headers.get("location")).toBe("https://blob.example.com/cert-1.pdf");
  });

  it("returns 302 for an admin viewer", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-99",
      serviceId: "svc-1",
      fileUrl: "https://blob.example.com/cert-1.pdf",
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "admin-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("cert-1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://blob.example.com/cert-1.pdf");
  });

  it("returns 302 for a coordinator in the same service", async () => {
    mockSession({ id: "coord-1", name: "Coord", role: "coordinator", serviceId: "svc-1" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-99",
      serviceId: "svc-1",
      fileUrl: "https://blob.example.com/cert-1.pdf",
    });
    // First findUnique = active check; second = coord's serviceId lookup
    prismaMock.user.findUnique.mockImplementation(({ where, select }: { where?: { id?: string }; select?: { active?: boolean; serviceId?: boolean } }) => {
      if (where?.id === "coord-1" && select?.active) {
        return Promise.resolve({ active: true });
      }
      if (where?.id === "coord-1" && select?.serviceId) {
        return Promise.resolve({ serviceId: "svc-1" });
      }
      return Promise.resolve(null);
    });

    const res = await callRoute("cert-1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://blob.example.com/cert-1.pdf");
  });

  it("returns 403 for a coordinator in a different service", async () => {
    mockSession({ id: "coord-2", name: "Coord", role: "coordinator", serviceId: "svc-2" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-99",
      serviceId: "svc-1",
      fileUrl: "https://blob.example.com/cert-1.pdf",
    });
    prismaMock.user.findUnique.mockImplementation(({ where, select }: { where?: { id?: string }; select?: { active?: boolean; serviceId?: boolean } }) => {
      if (where?.id === "coord-2" && select?.active) {
        return Promise.resolve({ active: true });
      }
      if (where?.id === "coord-2" && select?.serviceId) {
        return Promise.resolve({ serviceId: "svc-2" });
      }
      return Promise.resolve(null);
    });

    const res = await callRoute("cert-1");
    expect(res.status).toBe(403);
  });

  it("returns 403 for a staff viewer looking at someone else's cert", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-99",
      serviceId: "svc-1",
      fileUrl: "https://blob.example.com/cert-1.pdf",
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "staff-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("cert-1");
    expect(res.status).toBe(403);
  });

  it("returns 404 when the cert doesn't exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    const res = await callRoute("missing-cert");
    expect(res.status).toBe(404);
  });

  it("returns 404 when the cert exists but has no file attached", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-99",
      serviceId: "svc-1",
      fileUrl: null,
    });
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    const res = await callRoute("cert-1");
    expect(res.status).toBe(404);
  });
});
