import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
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

// Stub out the file upload pipeline so we never touch Vercel Blob in tests.
vi.mock("@/app/api/_lib/upload", async () => {
  const mod = await vi.importActual<typeof import("@/app/api/_lib/upload")>(
    "@/app/api/_lib/upload",
  );
  return {
    ...mod,
    saveUploadedBuffer: vi.fn(async (_buf: Buffer, filename: string) => ({
      fileUrl: `https://mock-blob.local/policies/${filename}`,
      fileName: filename,
      fileSize: 1024,
    })),
  };
});

import { GET as LIST_GET, POST as LIST_POST } from "@/app/api/policies/route";
import { GET as DETAIL_GET, PATCH as DETAIL_PATCH } from "@/app/api/policies/[id]/route";
import { POST as VERSION_POST } from "@/app/api/policies/[id]/versions/route";
import { PATCH as ARCHIVE_PATCH } from "@/app/api/policies/[id]/archive/route";
import { POST as ACK_POST } from "@/app/api/policies/[id]/acknowledge/route";
import { GET as ACK_LIST_GET } from "@/app/api/policies/[id]/acknowledgements/route";
import { GET as FILE_GET } from "@/app/api/policies/[id]/file/route";
import { GET as PENDING_GET } from "@/app/api/policies/my-pending/route";
import { GET as PENDING_COUNT_GET } from "@/app/api/policies/my-pending/count/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

// ── helpers ─────────────────────────────────────────────────────────────────

function pdfFile(name = "test.pdf"): File {
  // %PDF magic bytes + filler so the upload helper would be satisfied if it
  // were not mocked. The mock ignores content; this just makes the test
  // expressive about what's being sent.
  const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
  return new File([buf], name, { type: "application/pdf" });
}

function multipartReq(
  path: string,
  fields: Record<string, string>,
  file?: { field: string; file: File },
) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (file) form.append(file.field, file.file);
  // Use the global Request so FormData is properly serialised, then wrap
  // in NextRequest the same way createRequest() does.
  const url = path.startsWith("http") ? path : `http://localhost:3000${path}`;
  const init = { method: "POST", body: form };
  return new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]);
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  // Default: any authed user is active. Individual tests can override.
  prismaMock.user.findUnique.mockImplementation(async (args: { where?: { id?: string } } | undefined) => {
    if (args?.where?.id) return { active: true };
    return null;
  });
  // Default $transaction is provided by prismaMock; use it as-is.
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/policies
// ════════════════════════════════════════════════════════════════════════════
describe("GET /api/policies", () => {
  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await LIST_GET(createRequest("GET", "/api/policies"));
    expect(res.status).toBe(401);
  });

  it("lists non-archived documents with caller's ack status", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findMany.mockResolvedValue([
      {
        id: "doc-1",
        title: "Child Safety",
        description: null,
        category: "policy",
        isArchived: false,
        currentVersionId: "v-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        currentVersion: { id: "v-1", versionNumber: 1, fileName: "x.pdf", fileSize: 10, uploadedAt: new Date(), uploadedBy: null },
      },
    ]);
    prismaMock.policyDocumentAcknowledgement.findMany.mockResolvedValue([
      { versionId: "v-1", acknowledgedAt: new Date("2026-05-10") },
    ]);

    const res = await LIST_GET(createRequest("GET", "/api/policies"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("doc-1");
    expect(body[0].myAcknowledgedAt).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/policies — create + initial PDF upload
// ════════════════════════════════════════════════════════════════════════════
describe("POST /api/policies", () => {
  it("returns 403 for non-admin roles", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff" });
    const req = multipartReq("/api/policies", { title: "Anti-Bullying", category: "policy" }, { field: "file", file: pdfFile() });
    const res = await LIST_POST(req);
    expect(res.status).toBe(403);
  });

  it("rejects when title is missing", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const req = multipartReq("/api/policies", { category: "policy" }, { field: "file", file: pdfFile() });
    const res = await LIST_POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects when file is missing", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const req = multipartReq("/api/policies", { title: "Anti-Bullying", category: "policy" });
    const res = await LIST_POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects duplicate title with 409", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({ id: "existing" });
    const req = multipartReq(
      "/api/policies",
      { title: "Anti-Bullying", category: "policy" },
      { field: "file", file: pdfFile() },
    );
    const res = await LIST_POST(req);
    expect(res.status).toBe(409);
  });

  it("creates document + version 1 + activity log on happy path", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.policyDocument.findUnique.mockResolvedValue(null);

    // $transaction(fn) in our prisma-mock invokes fn(proxy) and returns its result.
    prismaMock.policyDocument.create.mockResolvedValue({ id: "doc-1", title: "Anti-Bullying" });
    prismaMock.policyDocumentVersion.create.mockResolvedValue({ id: "v-1", versionNumber: 1 });
    prismaMock.policyDocument.update.mockResolvedValue({
      id: "doc-1",
      title: "Anti-Bullying",
      currentVersionId: "v-1",
      currentVersion: { id: "v-1", versionNumber: 1 },
    });

    const req = multipartReq(
      "/api/policies",
      { title: "Anti-Bullying", description: "Be kind.", category: "policy" },
      { field: "file", file: pdfFile("anti-bullying.pdf") },
    );
    const res = await LIST_POST(req);
    expect(res.status).toBe(201);

    expect(prismaMock.policyDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: "Anti-Bullying", category: "policy", description: "Be kind." }),
      }),
    );
    expect(prismaMock.policyDocumentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentId: "doc-1", versionNumber: 1, uploadedById: "admin-1" }),
      }),
    );
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET / PATCH /api/policies/[id]
// ════════════════════════════════════════════════════════════════════════════
describe("GET /api/policies/[id]", () => {
  it("returns 404 when document missing", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findUnique.mockResolvedValue(null);
    const res = await DETAIL_GET(createRequest("GET", "/api/policies/x"), paramsFor("x"));
    expect(res.status).toBe(404);
  });

  it("returns versions + myAcknowledgedAt", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      title: "A",
      description: null,
      category: "policy",
      isArchived: false,
      currentVersionId: "v-2",
      createdAt: new Date(),
      updatedAt: new Date(),
      currentVersion: { id: "v-2", versionNumber: 2 },
      versions: [
        { id: "v-2", versionNumber: 2 },
        { id: "v-1", versionNumber: 1 },
      ],
    });
    prismaMock.policyDocumentAcknowledgement.findUnique.mockResolvedValue({
      acknowledgedAt: new Date("2026-05-10"),
    });
    const res = await DETAIL_GET(createRequest("GET", "/api/policies/doc-1"), paramsFor("doc-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.versions).toHaveLength(2);
    expect(body.myAcknowledgedAt).toBeTruthy();
  });
});

describe("PATCH /api/policies/[id]", () => {
  it("returns 403 for staff", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff" });
    const res = await DETAIL_PATCH(
      createRequest("PATCH", "/api/policies/x", { body: { title: "B" } }),
      paramsFor("x"),
    );
    expect(res.status).toBe(403);
  });

  it("updates title and writes an activity log", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.policyDocument.findUnique.mockResolvedValueOnce({ id: "doc-1", title: "Old" });
    prismaMock.policyDocument.findUnique.mockResolvedValueOnce(null); // title-clash check
    prismaMock.policyDocument.update.mockResolvedValue({ id: "doc-1", title: "New" });

    const res = await DETAIL_PATCH(
      createRequest("PATCH", "/api/policies/doc-1", { body: { title: "New" } }),
      paramsFor("doc-1"),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.policyDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "doc-1" }, data: { title: "New" } }),
    );
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
  });

  it("rejects renaming over an existing title", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.policyDocument.findUnique.mockResolvedValueOnce({ id: "doc-1", title: "Old" });
    prismaMock.policyDocument.findUnique.mockResolvedValueOnce({ id: "other" }); // title is taken
    const res = await DETAIL_PATCH(
      createRequest("PATCH", "/api/policies/doc-1", { body: { title: "Taken" } }),
      paramsFor("doc-1"),
    );
    expect(res.status).toBe(409);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/policies/[id]/versions
// ════════════════════════════════════════════════════════════════════════════
describe("POST /api/policies/[id]/versions", () => {
  it("returns 403 for staff", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff" });
    const req = multipartReq("/api/policies/doc-1/versions", {}, { field: "file", file: pdfFile() });
    const res = await VERSION_POST(req, paramsFor("doc-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when document missing", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.policyDocument.findUnique.mockResolvedValue(null);
    const req = multipartReq("/api/policies/doc-1/versions", {}, { field: "file", file: pdfFile() });
    const res = await VERSION_POST(req, paramsFor("doc-1"));
    expect(res.status).toBe(404);
  });

  it("rejects uploading to an archived document", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      title: "Old",
      isArchived: true,
    });
    const req = multipartReq("/api/policies/doc-1/versions", {}, { field: "file", file: pdfFile() });
    const res = await VERSION_POST(req, paramsFor("doc-1"));
    expect(res.status).toBe(400);
  });

  it("bumps versionNumber from the previous max", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      title: "X",
      isArchived: false,
    });
    prismaMock.policyDocumentVersion.findFirst.mockResolvedValue({ versionNumber: 4 });
    prismaMock.policyDocumentVersion.create.mockResolvedValue({ id: "v-5", versionNumber: 5 });
    prismaMock.policyDocument.update.mockResolvedValue({ id: "doc-1" });

    const req = multipartReq("/api/policies/doc-1/versions", {}, { field: "file", file: pdfFile() });
    const res = await VERSION_POST(req, paramsFor("doc-1"));
    expect(res.status).toBe(201);

    expect(prismaMock.policyDocumentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentId: "doc-1", versionNumber: 5 }),
      }),
    );
    expect(prismaMock.policyDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentVersionId: "v-5" } }),
    );
  });

  it("starts at versionNumber 1 when no prior versions exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      title: "X",
      isArchived: false,
    });
    prismaMock.policyDocumentVersion.findFirst.mockResolvedValue(null);
    prismaMock.policyDocumentVersion.create.mockResolvedValue({ id: "v-1", versionNumber: 1 });
    prismaMock.policyDocument.update.mockResolvedValue({ id: "doc-1" });

    const req = multipartReq("/api/policies/doc-1/versions", {}, { field: "file", file: pdfFile() });
    const res = await VERSION_POST(req, paramsFor("doc-1"));
    expect(res.status).toBe(201);
    expect(prismaMock.policyDocumentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ versionNumber: 1 }) }),
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/policies/[id]/archive
// ════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/policies/[id]/archive", () => {
  it("returns 403 for staff", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff" });
    const res = await ARCHIVE_PATCH(
      createRequest("PATCH", "/api/policies/x/archive", { body: {} }),
      paramsFor("x"),
    );
    expect(res.status).toBe(403);
  });

  it("flips isArchived to true by default", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      title: "X",
      isArchived: false,
    });
    prismaMock.policyDocument.update.mockResolvedValue({
      id: "doc-1",
      isArchived: true,
      title: "X",
    });
    const res = await ARCHIVE_PATCH(
      createRequest("PATCH", "/api/policies/doc-1/archive", { body: {} }),
      paramsFor("doc-1"),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.policyDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isArchived: true } }),
    );
  });

  it("no-ops when isArchived already matches", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      title: "X",
      isArchived: true,
    });
    const res = await ARCHIVE_PATCH(
      createRequest("PATCH", "/api/policies/doc-1/archive", { body: { isArchived: true } }),
      paramsFor("doc-1"),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.policyDocument.update).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/policies/[id]/acknowledge
// ════════════════════════════════════════════════════════════════════════════
describe("POST /api/policies/[id]/acknowledge", () => {
  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await ACK_POST(
      createRequest("POST", "/api/policies/doc-1/acknowledge"),
      paramsFor("doc-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the document is missing", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findUnique.mockResolvedValue(null);
    const res = await ACK_POST(
      createRequest("POST", "/api/policies/missing/acknowledge"),
      paramsFor("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when the document is archived", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      title: "X",
      isArchived: true,
      currentVersionId: "v-1",
    });
    const res = await ACK_POST(
      createRequest("POST", "/api/policies/doc-1/acknowledge"),
      paramsFor("doc-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the document has no current version", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      title: "X",
      isArchived: false,
      currentVersionId: null,
    });
    const res = await ACK_POST(
      createRequest("POST", "/api/policies/doc-1/acknowledge"),
      paramsFor("doc-1"),
    );
    expect(res.status).toBe(400);
  });

  it("creates an acknowledgement on first ack", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      title: "X",
      isArchived: false,
      currentVersionId: "v-1",
    });
    prismaMock.policyDocumentAcknowledgement.findUnique.mockResolvedValue(null);
    prismaMock.policyDocumentAcknowledgement.create.mockResolvedValue({
      id: "ack-1",
      versionId: "v-1",
      userId: "u-1",
      acknowledgedAt: new Date(),
    });
    const res = await ACK_POST(
      createRequest("POST", "/api/policies/doc-1/acknowledge"),
      paramsFor("doc-1"),
    );
    expect(res.status).toBe(201);
  });

  it("is idempotent — returns the existing ack on duplicate", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      title: "X",
      isArchived: false,
      currentVersionId: "v-1",
    });
    prismaMock.policyDocumentAcknowledgement.findUnique.mockResolvedValue({
      id: "ack-1",
      acknowledgedAt: new Date(),
    });
    const res = await ACK_POST(
      createRequest("POST", "/api/policies/doc-1/acknowledge"),
      paramsFor("doc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyAcknowledged).toBe(true);
    expect(prismaMock.policyDocumentAcknowledgement.create).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/policies/[id]/acknowledgements
// ════════════════════════════════════════════════════════════════════════════
describe("GET /api/policies/[id]/acknowledgements", () => {
  it("returns 403 for staff", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff" });
    const res = await ACK_LIST_GET(
      createRequest("GET", "/api/policies/doc-1/acknowledgements"),
      paramsFor("doc-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns summary + per-row breakdown for admin", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      currentVersionId: "v-2",
      currentVersion: { id: "v-2", versionNumber: 2 },
    });
    prismaMock.policyDocumentAcknowledgement.findMany.mockResolvedValue([
      {
        id: "a-1",
        versionId: "v-2",
        userId: "u-1",
        acknowledgedAt: new Date(),
        user: { id: "u-1", name: "Alice", email: "a@x", avatar: null },
        version: { id: "v-2", versionNumber: 2 },
      },
      {
        id: "a-2",
        versionId: "v-1",
        userId: "u-2",
        acknowledgedAt: new Date(),
        user: { id: "u-2", name: "Bob", email: "b@x", avatar: null },
        version: { id: "v-1", versionNumber: 1 },
      },
    ]);
    prismaMock.user.count.mockResolvedValue(10);
    const res = await ACK_LIST_GET(
      createRequest("GET", "/api/policies/doc-1/acknowledgements"),
      paramsFor("doc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalStaff).toBe(10);
    expect(body.currentVersionNumber).toBe(2);
    expect(body.currentVersionAcked).toBe(1); // only one ack is on v-2
    expect(body.acknowledgements).toHaveLength(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/policies/[id]/file — authenticated PDF proxy
// ════════════════════════════════════════════════════════════════════════════
describe("GET /api/policies/[id]/file", () => {
  it("returns 404 when document missing", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findUnique.mockResolvedValue(null);
    const res = await FILE_GET(
      createRequest("GET", "/api/policies/x/file"),
      paramsFor("x"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when document has no version uploaded", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      currentVersionId: null,
      isArchived: false,
    });
    const res = await FILE_GET(
      createRequest("GET", "/api/policies/doc-1/file"),
      paramsFor("doc-1"),
    );
    expect(res.status).toBe(404);
  });

  it("streams the PDF with the right headers when version exists", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      currentVersionId: "v-1",
      isArchived: false,
    });
    prismaMock.policyDocumentVersion.findUnique.mockResolvedValue({
      id: "v-1",
      documentId: "doc-1",
      fileUrl: "https://mock-blob.local/policies/test.pdf",
      fileName: "test.pdf",
      fileSize: 1234,
    });
    // Replace global fetch for this test only.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("FAKE-PDF-BYTES", { status: 200 }),
    );
    const res = await FILE_GET(
      createRequest("GET", "/api/policies/doc-1/file"),
      paramsFor("doc-1"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/inline; filename="test\.pdf"/);
    expect(fetchSpy).toHaveBeenCalledWith("https://mock-blob.local/policies/test.pdf");
    fetchSpy.mockRestore();
  });

  it("strips CR/LF/quote from a filename when building the disposition header", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findUnique.mockResolvedValue({
      id: "doc-1",
      currentVersionId: "v-1",
      isArchived: false,
    });
    prismaMock.policyDocumentVersion.findUnique.mockResolvedValue({
      id: "v-1",
      documentId: "doc-1",
      fileUrl: "https://mock-blob.local/policies/x.pdf",
      fileName: 'nasty"\r\nname.pdf',
      fileSize: 10,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("FAKE-PDF-BYTES", { status: 200 }),
    );
    const res = await FILE_GET(
      createRequest("GET", "/api/policies/doc-1/file"),
      paramsFor("doc-1"),
    );
    const disposition = res.headers.get("content-disposition") || "";
    expect(disposition).not.toMatch(/[\r\n"]/g.source.replace(/^"/, '"').replace(/\\"/, '"'));
    expect(disposition).toMatch(/inline; filename="nasty___name\.pdf"/);
    fetchSpy.mockRestore();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/policies/my-pending  +  /count
// ════════════════════════════════════════════════════════════════════════════
describe("GET /api/policies/my-pending", () => {
  it("returns only documents whose current version the caller hasn't acked", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findMany.mockResolvedValue([
      { id: "d-1", title: "A", currentVersionId: "v-1", currentVersion: { id: "v-1", versionNumber: 1, fileName: "a.pdf", uploadedAt: new Date() } },
      { id: "d-2", title: "B", currentVersionId: "v-2", currentVersion: { id: "v-2", versionNumber: 1, fileName: "b.pdf", uploadedAt: new Date() } },
    ]);
    prismaMock.policyDocumentAcknowledgement.findMany.mockResolvedValue([
      { versionId: "v-2" }, // u-1 has acked d-2 only
    ]);
    const res = await PENDING_GET(createRequest("GET", "/api/policies/my-pending"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("d-1");
  });
});

describe("GET /api/policies/my-pending/count", () => {
  it("returns 0 when no documents have current versions", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findMany.mockResolvedValue([]);
    const res = await PENDING_COUNT_GET(createRequest("GET", "/api/policies/my-pending/count"));
    const body = await res.json();
    expect(body).toEqual({ count: 0 });
  });

  it("returns the count of unacked current versions", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff" });
    prismaMock.policyDocument.findMany.mockResolvedValue([
      { currentVersionId: "v-1" },
      { currentVersionId: "v-2" },
      { currentVersionId: "v-3" },
    ]);
    prismaMock.policyDocumentAcknowledgement.count.mockResolvedValue(1);
    const res = await PENDING_COUNT_GET(createRequest("GET", "/api/policies/my-pending/count"));
    const body = await res.json();
    expect(body).toEqual({ count: 2 });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// upload helper — saveUploadedBuffer (delegates to mocked uploadFile)
// ════════════════════════════════════════════════════════════════════════════
describe("saveUploadedBuffer (PDF policy)", () => {
  beforeEach(() => {
    process.env.MOCK_PDF = "1";
  });

  it("rejects a non-PDF extension when allowedExtensions = ['.pdf']", async () => {
    const { saveUploadedBuffer } = await vi.importActual<typeof import("@/app/api/_lib/upload")>(
      "@/app/api/_lib/upload",
    );
    // 4 bytes "PK\x03\x04" — looks like a zip
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    await expect(
      saveUploadedBuffer(buf, "policy.docx", "policies", {
        allowedExtensions: [".pdf"],
        requiredMimeType: "application/pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(/not allowed/);
  });

  it("rejects a .pdf-extension file whose magic bytes are not %PDF", async () => {
    const { saveUploadedBuffer } = await vi.importActual<typeof import("@/app/api/_lib/upload")>(
      "@/app/api/_lib/upload",
    );
    const buf = Buffer.from("not a pdf");
    await expect(
      saveUploadedBuffer(buf, "evil.pdf", "policies", {
        allowedExtensions: [".pdf"],
        requiredMimeType: "application/pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(/does not match extension/);
  });

  it("rejects a declared MIME mismatch", async () => {
    const { saveUploadedBuffer } = await vi.importActual<typeof import("@/app/api/_lib/upload")>(
      "@/app/api/_lib/upload",
    );
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
    await expect(
      saveUploadedBuffer(buf, "good.pdf", "policies", {
        allowedExtensions: [".pdf"],
        requiredMimeType: "application/pdf",
        mimeType: "application/octet-stream",
      }),
    ).rejects.toThrow(/Unexpected MIME/);
  });

  it("accepts a well-formed PDF buffer", async () => {
    const { saveUploadedBuffer } = await vi.importActual<typeof import("@/app/api/_lib/upload")>(
      "@/app/api/_lib/upload",
    );
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
    const out = await saveUploadedBuffer(buf, "good.pdf", "policies", {
      allowedExtensions: [".pdf"],
      requiredMimeType: "application/pdf",
      mimeType: "application/pdf",
    });
    expect(out.fileName).toBe("good.pdf");
    expect(out.fileUrl).toMatch(/^https:\/\/mock-blob\.local\//);
  });
});
