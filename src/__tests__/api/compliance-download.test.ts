/**
 * Access matrix tests for GET /api/compliance/[id]/download.
 *
 * The route performs an access-checked stream of the cert out of blob
 * storage (was a redirect until 2026-09-15). The
 * matrix:
 *   - Own cert (userId === viewerId): 200 (streamed)
 *   - Admin (owner/head_office/admin): 200 (streamed)
 *   - Coordinator in same service as cert: 200 (streamed)
 *   - Coordinator in a different service: 403
 *   - Staff viewing someone else's cert: 403
 *   - Missing file (fileUrl is null): 404
 *   - Not-found cert: 404
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

// 2026-09-15: these routes STREAM the stored file back over our own origin
// instead of redirecting to blob storage — a cross-origin redirect is
// unrenderable in the in-app viewer because CSP has no frame-src. So the
// fixture URL has to be a real Blob host (streamStoredFile refuses anything
// else as an SSRF guard) and the upstream fetch has to be stubbed.
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response("PDFBYTES", {
      status: 200,
      headers: { "content-type": "application/pdf" },
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("streams the file for the cert owner", async () => {
    mockSession({ id: "user-1", name: "Owner User", role: "staff" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-1",
      serviceId: "svc-1",
      fileUrl: "https://t3st.public.blob.vercel-storage.com/cert-1.pdf",
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "user-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("cert-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("streams the file for an admin viewer", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-99",
      serviceId: "svc-1",
      fileUrl: "https://t3st.public.blob.vercel-storage.com/cert-1.pdf",
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "admin-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("cert-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("streams the file for a coordinator in the same service", async () => {
    mockSession({ id: "coord-1", name: "Coord", role: "member", serviceId: "svc-1" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-99",
      serviceId: "svc-1",
      fileUrl: "https://t3st.public.blob.vercel-storage.com/cert-1.pdf",
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
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("returns 403 for a coordinator in a different service", async () => {
    mockSession({ id: "coord-2", name: "Coord", role: "member", serviceId: "svc-2" });
    prismaMock.complianceCertificate.findUnique.mockResolvedValue({
      id: "cert-1",
      userId: "user-99",
      serviceId: "svc-1",
      fileUrl: "https://t3st.public.blob.vercel-storage.com/cert-1.pdf",
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
      fileUrl: "https://t3st.public.blob.vercel-storage.com/cert-1.pdf",
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
