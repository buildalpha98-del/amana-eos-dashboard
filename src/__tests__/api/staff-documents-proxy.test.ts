/**
 * Access matrix tests for GET /api/staff-documents/[id].
 *
 * The route is an auth-checked redirect proxy used by the staff profile
 * Documents tab so HR docs aren't surfaced as raw blob URLs in markup.
 *
 * Matrix:
 *   - Uploader OR assignee is the viewer: 307
 *   - Admin (owner / admin / head_office): 307
 *   - Coordinator in the same service as the doc's assignee: 307
 *   - Member in a different service: 403
 *   - Missing fileUrl: 404
 *   - Deleted (soft-delete): 404
 *   - Missing document: 404
 *   - Unauthenticated: 401
 *   - ?download=1 appends ?download=<filename> to the target URL
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
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { GET } from "@/app/api/staff-documents/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const BLOB = "https://blob.example.com/docs/abc.pdf";

function callRoute(docId: string, query?: string) {
  const url = `/api/staff-documents/${docId}${query ? `?${query}` : ""}`;
  const req = createRequest("GET", url);
  return GET(req, { params: Promise.resolve({ id: docId }) });
}

describe("GET /api/staff-documents/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await callRoute("doc-1");
    expect(res.status).toBe(401);
  });

  it("returns 307 when the viewer is the document uploader", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.document.findUnique.mockResolvedValue({
      id: "doc-1",
      fileUrl: BLOB,
      fileName: "contract.pdf",
      deleted: false,
      uploadedById: "staff-1",
      assignedToId: null,
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "staff-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("doc-1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(BLOB);
  });

  it("returns 307 when the viewer is the document assignee", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.document.findUnique.mockResolvedValue({
      id: "doc-1",
      fileUrl: BLOB,
      fileName: "contract.pdf",
      deleted: false,
      uploadedById: "admin-99",
      assignedToId: "staff-1",
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "staff-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("doc-1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(BLOB);
  });

  it("returns 307 for an admin viewing another user's document", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.document.findUnique.mockResolvedValue({
      id: "doc-1",
      fileUrl: BLOB,
      fileName: "contract.pdf",
      deleted: false,
      uploadedById: "staff-99",
      assignedToId: "staff-99",
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "admin-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("doc-1");
    expect(res.status).toBe(307);
  });

  it("returns 307 for a member in the same service as the doc's assignee", async () => {
    mockSession({ id: "coord-1", name: "Coord", role: "member" });
    prismaMock.document.findUnique.mockResolvedValue({
      id: "doc-1",
      fileUrl: BLOB,
      fileName: "contract.pdf",
      deleted: false,
      uploadedById: "admin-99",
      assignedToId: "staff-99",
    });
    // The proxy runs two user.findUnique calls for the service comparison plus
    // the initial active-check by withApiAuth.
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

    const res = await callRoute("doc-1");
    expect(res.status).toBe(307);
  });

  it("returns 403 for a member in a different service than the doc's assignee", async () => {
    mockSession({ id: "coord-2", name: "Coord", role: "member" });
    prismaMock.document.findUnique.mockResolvedValue({
      id: "doc-1",
      fileUrl: BLOB,
      fileName: "contract.pdf",
      deleted: false,
      uploadedById: "admin-99",
      assignedToId: "staff-99",
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

    const res = await callRoute("doc-1");
    expect(res.status).toBe(403);
  });

  it("returns 404 when the document is soft-deleted", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.document.findUnique.mockResolvedValue({
      id: "doc-1",
      fileUrl: BLOB,
      fileName: "contract.pdf",
      deleted: true,
      uploadedById: "staff-99",
      assignedToId: "staff-99",
    });
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    const res = await callRoute("doc-1");
    expect(res.status).toBe(404);
  });

  it("returns 404 when the document has no fileUrl", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.document.findUnique.mockResolvedValue({
      id: "doc-1",
      fileUrl: null,
      fileName: "contract.pdf",
      deleted: false,
      uploadedById: "staff-99",
      assignedToId: "staff-99",
    });
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    const res = await callRoute("doc-1");
    expect(res.status).toBe(404);
  });

  it("returns 404 when the document doesn't exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.document.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    const res = await callRoute("missing-doc");
    expect(res.status).toBe(404);
  });

  it("?download=1 appends &download=<filename> to the redirect target", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.document.findUnique.mockResolvedValue({
      id: "doc-1",
      fileUrl: BLOB,
      fileName: "Final Contract v2.pdf",
      deleted: false,
      uploadedById: "staff-1",
      assignedToId: null,
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "staff-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("doc-1", "download=1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      `${BLOB}?download=${encodeURIComponent("Final Contract v2.pdf")}`,
    );
  });
});
