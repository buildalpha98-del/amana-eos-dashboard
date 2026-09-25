/**
 * Access matrix tests for GET /api/qualifications/[id]/download — the new
 * auth-checked streaming proxy used by the staff profile's Certifications
 * sub-tab so qualification files aren't surfaced as raw blob URLs.
 *
 * Matrix:
 *   - Own qualification (userId === viewer): 200 (streamed)
 *   - Admin (owner / admin / head_office): 200 (streamed)
 *   - Coordinator in same service as owner: 200 (streamed)
 *   - Member in a different service: 403
 *   - Missing certificateUrl: 404
 *   - Missing qualification: 404
 *   - Unauthenticated: 401
 *   - ?download=1 answers Content-Disposition: attachment
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { GET } from "@/app/api/qualifications/[id]/download/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const BLOB = "https://t3st.public.blob.vercel-storage.com/quals/cert.pdf";

function callRoute(id: string, query?: string) {
  const url = `/api/qualifications/${id}/download${query ? `?${query}` : ""}`;
  const req = createRequest("GET", url);
  return GET(req, { params: Promise.resolve({ id }) });
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

describe("GET /api/qualifications/[id]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await callRoute("q-1");
    expect(res.status).toBe(401);
  });

  it("streams the file for the qualification owner", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.staffQualification.findUnique.mockResolvedValue({
      id: "q-1",
      userId: "staff-1",
      name: "First Aid",
      certificateUrl: BLOB,
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "staff-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("q-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("streams the file for an admin viewing another user's qualification", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.staffQualification.findUnique.mockResolvedValue({
      id: "q-1",
      userId: "staff-99",
      name: "First Aid",
      certificateUrl: BLOB,
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "admin-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("q-1");
    expect(res.status).toBe(200);
  });

  it("streams the file for a member coordinator in the same service as the owner", async () => {
    mockSession({ id: "coord-1", name: "Coord", role: "member" });
    prismaMock.staffQualification.findUnique.mockResolvedValue({
      id: "q-1",
      userId: "staff-99",
      name: "First Aid",
      certificateUrl: BLOB,
    });
    prismaMock.user.findUnique.mockImplementation(({ where, select }: { where?: { id?: string }; select?: { active?: boolean; serviceId?: boolean } }) => {
      if (where?.id === "coord-1" && select?.active) {
        return Promise.resolve({ active: true });
      }
      if (where?.id === "coord-1" && select?.serviceId) {
        return Promise.resolve({ serviceId: "svc-shared" });
      }
      if (where?.id === "staff-99" && select?.serviceId) {
        return Promise.resolve({ serviceId: "svc-shared" });
      }
      return Promise.resolve(null);
    });

    const res = await callRoute("q-1");
    expect(res.status).toBe(200);
  });

  it("returns 403 for a member in a different service", async () => {
    mockSession({ id: "coord-2", name: "Coord", role: "member" });
    prismaMock.staffQualification.findUnique.mockResolvedValue({
      id: "q-1",
      userId: "staff-99",
      name: "First Aid",
      certificateUrl: BLOB,
    });
    prismaMock.user.findUnique.mockImplementation(({ where, select }: { where?: { id?: string }; select?: { active?: boolean; serviceId?: boolean } }) => {
      if (where?.id === "coord-2" && select?.active) {
        return Promise.resolve({ active: true });
      }
      if (where?.id === "coord-2" && select?.serviceId) {
        return Promise.resolve({ serviceId: "svc-coord" });
      }
      if (where?.id === "staff-99" && select?.serviceId) {
        return Promise.resolve({ serviceId: "svc-staff" });
      }
      return Promise.resolve(null);
    });

    const res = await callRoute("q-1");
    expect(res.status).toBe(403);
  });

  it("returns 404 when the qualification has no certificateUrl", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.staffQualification.findUnique.mockResolvedValue({
      id: "q-1",
      userId: "staff-99",
      name: "First Aid",
      certificateUrl: null,
    });
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    const res = await callRoute("q-1");
    expect(res.status).toBe(404);
  });

  it("returns 404 when the qualification doesn't exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.staffQualification.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    const res = await callRoute("missing");
    expect(res.status).toBe(404);
  });

  it("?download=1 delivers the file as an attachment, not inline", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.staffQualification.findUnique.mockResolvedValue({
      id: "q-1",
      userId: "staff-1",
      name: "Certificate III",
      certificateUrl: BLOB,
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "staff-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("q-1", "download=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("Content-Disposition")).toContain("Certificate III");
  });
});
