/**
 * Regression tests for POST /api/upload — the generic uploader used by the
 * documents library, bulk document upload, and other "pick a file from disk"
 * flows.
 *
 * Historically users reported "PDF uploads fail" — these tests pin the
 * happy-path behaviour so PDFs keep working, plus the validation paths that
 * reject junk or mislabelled files.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---------------------------------------------------------------

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
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

const mockUpload = vi.fn();
vi.mock("@/lib/storage", () => ({
  uploadFile: (...args: unknown[]) => mockUpload(...args),
  deleteFile: vi.fn(),
}));

// Auth helpers (must be imported after vi.mock calls that they depend on)
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { POST } from "@/app/api/upload/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

// --- Helpers -------------------------------------------------------------

function createFormDataRequest(path: string, formData: FormData): NextRequest {
  const init = new Request(`http://localhost:3000${path}`, {
    method: "POST",
    body: formData,
  });
  return new NextRequest(init);
}

/** Minimal valid PDF header bytes: "%PDF-1.4\n...". */
function pdfBytes(extraSize = 0): BlobPart {
  const header = new TextEncoder().encode("%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n");
  const padding = new Uint8Array(extraSize);
  const out = new Uint8Array(header.length + padding.length);
  out.set(header, 0);
  out.set(padding, header.length);
  return out as BlobPart;
}

/** Minimal valid PNG header (89 50 4E 47 0D 0A 1A 0A). */
function pngBytes(): BlobPart {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]) as BlobPart;
}

/** Minimal valid JPEG header (FF D8 FF E0). */
function jpegBytes(): BlobPart {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) as BlobPart;
}

// --- Tests ---------------------------------------------------------------

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    mockUpload.mockResolvedValue({
      url: "https://blob.example.com/uploads/test.pdf",
      size: 1024,
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const fd = new FormData();
    fd.append("file", new File([pdfBytes()], "test.pdf", { type: "application/pdf" }));

    const req = createFormDataRequest("/api/upload", fd);
    const res = await POST(req, {});
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file is provided", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();

    const req = createFormDataRequest("/api/upload", fd);
    const res = await POST(req, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/no file/i);
  });

  it("accepts a valid PDF upload (regression for 'PDF uploads fail' bug)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    fd.append(
      "file",
      new File([pdfBytes()], "annual-report.pdf", { type: "application/pdf" }),
    );

    const req = createFormDataRequest("/api/upload", fd);
    const res = await POST(req, {});

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.fileName).toBe("annual-report.pdf");
    expect(data.mimeType).toBe("application/pdf");
    expect(data.fileUrl).toMatch(/^https:\/\//);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    const [, uniqueName, opts] = mockUpload.mock.calls[0];
    expect(uniqueName).toMatch(/\.pdf$/);
    expect(opts.contentType).toBe("application/pdf");
    expect(opts.folder).toBe("uploads");
  });

  it("accepts a 2 MB PDF (typical real-world size)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    // 2 MB of padding after the %PDF header
    fd.append(
      "file",
      new File([pdfBytes(2 * 1024 * 1024)], "bigger.pdf", {
        type: "application/pdf",
      }),
    );

    const req = createFormDataRequest("/api/upload", fd);
    const res = await POST(req, {});
    expect(res.status).toBe(200);
  });

  it("rejects a PDF that exceeds the 10 MB size cap", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    // 10 MB + 1 byte
    fd.append(
      "file",
      new File([pdfBytes(10 * 1024 * 1024 + 1)], "huge.pdf", {
        type: "application/pdf",
      }),
    );

    const req = createFormDataRequest("/api/upload", fd);
    const res = await POST(req, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/10MB/i);
  });

  it("rejects files whose declared MIME type is not allowed", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    fd.append(
      "file",
      new File([new Uint8Array([0x00, 0x01])], "weird.exe", {
        type: "application/x-msdownload",
      }),
    );

    const req = createFormDataRequest("/api/upload", fd);
    const res = await POST(req, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/not allowed/i);
  });

  it("rejects files whose magic bytes don't match the declared MIME type", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    // PNG bytes but declared as PDF — content should not match
    fd.append(
      "file",
      new File([pngBytes()], "fake.pdf", { type: "application/pdf" }),
    );

    const req = createFormDataRequest("/api/upload", fd);
    const res = await POST(req, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/does not match/i);
  });

  it("accepts PNG uploads (common image type)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    fd.append("file", new File([pngBytes()], "logo.png", { type: "image/png" }));

    const req = createFormDataRequest("/api/upload", fd);
    const res = await POST(req, {});
    expect(res.status).toBe(200);
  });

  it("accepts JPEG uploads (common image type)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    fd.append("file", new File([jpegBytes()], "photo.jpg", { type: "image/jpeg" }));

    const req = createFormDataRequest("/api/upload", fd);
    const res = await POST(req, {});
    expect(res.status).toBe(200);
  });
});
