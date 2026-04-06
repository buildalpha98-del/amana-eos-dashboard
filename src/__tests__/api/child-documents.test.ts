import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

function createFormDataRequest(path: string, formData: FormData): NextRequest {
  // Build a Request with FormData, then wrap in NextRequest
  const init = new Request(`http://localhost:3000${path}`, {
    method: "POST",
    body: formData,
  });
  return new NextRequest(init);
}

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

// Mock storage
vi.mock("@/lib/storage/uploadFile", () => ({
  uploadFile: vi.fn().mockResolvedValue("https://blob.example.com/test-doc.pdf"),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "@/app/api/children/[id]/documents/route";
import { PATCH, DELETE } from "@/app/api/children/[id]/documents/[documentId]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const routeCtx = (params: Record<string, string>) => ({
  params: Promise.resolve(params),
});

const sampleDoc = {
  id: "doc-1",
  childId: "child-1",
  documentType: "IMMUNISATION_RECORD",
  fileName: "immunisation.pdf",
  fileUrl: "https://blob.example.com/immunisation.pdf",
  uploaderType: "staff",
  expiresAt: new Date("2026-12-01"),
  isVerified: false,
  verifiedById: null,
  verifiedAt: null,
  notes: null,
  createdAt: new Date(),
  uploadedBy: { id: "user-1", name: "Test User" },
};

/* ------------------------------------------------------------------ */
/*  GET /api/children/[id]/documents                                   */
/* ------------------------------------------------------------------ */

describe("GET /api/children/[id]/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/children/child-1/documents");
    const res = await GET(req, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when child not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.child.findUnique.mockResolvedValue(null);
    const req = createRequest("GET", "/api/children/child-1/documents");
    const res = await GET(req, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(404);
  });

  it("returns 200 with documents array", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.child.findUnique.mockResolvedValue({ id: "child-1" });
    prismaMock.childDocument.findMany.mockResolvedValue([sampleDoc]);

    const req = createRequest("GET", "/api/children/child-1/documents");
    const res = await GET(req, routeCtx({ id: "child-1" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.documents).toHaveLength(1);
    expect(data.documents[0].id).toBe("doc-1");
    expect(data.documents[0].documentType).toBe("IMMUNISATION_RECORD");
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/children/[id]/documents                                  */
/* ------------------------------------------------------------------ */

describe("POST /api/children/[id]/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/children/child-1/documents");
    const res = await POST(req, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when child not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.child.findUnique.mockResolvedValue(null);

    const formData = new FormData();
    formData.append("file", new File(["test"], "test.pdf", { type: "application/pdf" }));
    formData.append("documentType", "IMMUNISATION_RECORD");

    const req = createFormDataRequest("/api/children/child-1/documents", formData);
    const res = await POST(req, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid document type", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.child.findUnique.mockResolvedValue({ id: "child-1" });

    const formData = new FormData();
    formData.append("file", new File(["test"], "test.pdf", { type: "application/pdf" }));
    formData.append("documentType", "INVALID_TYPE");

    const req = createFormDataRequest("/api/children/child-1/documents", formData);
    const res = await POST(req, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 on successful upload", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.child.findUnique.mockResolvedValue({ id: "child-1" });
    prismaMock.childDocument.create.mockResolvedValue(sampleDoc);

    const formData = new FormData();
    formData.append("file", new File(["test"], "test.pdf", { type: "application/pdf" }));
    formData.append("documentType", "IMMUNISATION_RECORD");
    formData.append("name", "Test Document");

    const req = createFormDataRequest("/api/children/child-1/documents", formData);
    const res = await POST(req, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(201);
  });
});

/* ------------------------------------------------------------------ */
/*  PATCH /api/children/[id]/documents/[documentId]                    */
/* ------------------------------------------------------------------ */

describe("PATCH /api/children/[id]/documents/[documentId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("PATCH", "/api/children/child-1/documents/doc-1", {
      body: { isVerified: true },
    });
    const res = await PATCH(req, routeCtx({ id: "child-1", documentId: "doc-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when document not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.childDocument.findFirst.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/children/child-1/documents/doc-999", {
      body: { isVerified: true },
    });
    const res = await PATCH(req, routeCtx({ id: "child-1", documentId: "doc-999" }));
    expect(res.status).toBe(404);
  });

  it("returns 200 and sets verifiedById when isVerified=true", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.childDocument.findFirst.mockResolvedValue({ ...sampleDoc });
    prismaMock.childDocument.update.mockResolvedValue({
      ...sampleDoc,
      isVerified: true,
      verifiedById: "user-1",
      verifiedAt: new Date(),
    });

    const req = createRequest("PATCH", "/api/children/child-1/documents/doc-1", {
      body: { isVerified: true },
    });
    const res = await PATCH(req, routeCtx({ id: "child-1", documentId: "doc-1" }));
    expect(res.status).toBe(200);

    // Verify the update was called with verifiedById
    const updateCall = prismaMock.childDocument.update.mock.calls[0][0];
    expect(updateCall.data.isVerified).toBe(true);
    expect(updateCall.data.verifiedById).toBe("user-1");
    expect(updateCall.data.verifiedAt).toBeDefined();
  });

  it("returns 200 when updating notes", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.childDocument.findFirst.mockResolvedValue({ ...sampleDoc });
    prismaMock.childDocument.update.mockResolvedValue({
      ...sampleDoc,
      notes: "Updated notes",
    });

    const req = createRequest("PATCH", "/api/children/child-1/documents/doc-1", {
      body: { notes: "Updated notes" },
    });
    const res = await PATCH(req, routeCtx({ id: "child-1", documentId: "doc-1" }));
    expect(res.status).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/children/[id]/documents/[documentId]                   */
/* ------------------------------------------------------------------ */

describe("DELETE /api/children/[id]/documents/[documentId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("DELETE", "/api/children/child-1/documents/doc-1");
    const res = await DELETE(req, routeCtx({ id: "child-1", documentId: "doc-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when document not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.childDocument.findFirst.mockResolvedValue(null);

    const req = createRequest("DELETE", "/api/children/child-1/documents/doc-999");
    const res = await DELETE(req, routeCtx({ id: "child-1", documentId: "doc-999" }));
    expect(res.status).toBe(404);
  });

  it("returns 200 and deletes blob + record", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.childDocument.findFirst.mockResolvedValue({ ...sampleDoc });
    prismaMock.childDocument.delete.mockResolvedValue({ id: "doc-1" });

    const req = createRequest("DELETE", "/api/children/child-1/documents/doc-1");
    const res = await DELETE(req, routeCtx({ id: "child-1", documentId: "doc-1" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
