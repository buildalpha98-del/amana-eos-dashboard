/**
 * POST /api/upload/verify
 *
 * Direct-to-Blob uploads (added 2026-08-25 to escape Vercel's ~4.5 MB
 * serverless request-body cap, which made staff WWCC uploads fail with a bare
 * 413) never pass through our server, so `/api/upload`'s magic-byte check
 * cannot run on them. This route restores that check by range-reading the
 * stored object. Verification is read-only: a caller-supplied URL never
 * authorises deleting an object, even when its claimed MIME type is wrong.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));

const deleteFile = vi.fn((_url: string) => Promise.resolve());
vi.mock("@/lib/storage", () => ({ deleteFile: (url: string) => deleteFile(url) }));

import { POST } from "@/app/api/upload/verify/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const BLOB = "https://abc123.public.blob.vercel-storage.com/uploads/wwcc.pdf";
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // %PDF-1
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

function mockBlobBody(bytes: Uint8Array, ok = true, status = 206) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(new Response(Uint8Array.from(bytes), { status: ok ? status : 404 })),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  _clearUserActiveCache();
  deleteFile.mockClear();
  prismaMock.user.findUnique.mockResolvedValue({ active: true } as never);
});

describe("POST /api/upload/verify", () => {
  it("401s without a session", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/upload/verify", {
        body: { url: BLOB, mimeType: "application/pdf" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("accepts a blob whose magic bytes match the declared type", async () => {
    mockSession({ id: "u1", name: "Tracie", role: "staff" });
    mockBlobBody(PDF_BYTES);

    const res = await POST(
      createRequest("POST", "/api/upload/verify", {
        body: { url: BLOB, mimeType: "application/pdf" },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("rejects a mismatched type without deleting a caller-selected file", async () => {
    mockSession({ id: "u1", name: "Tracie", role: "staff" });
    mockBlobBody(PNG_BYTES); // actually a PNG…

    const res = await POST(
      createRequest("POST", "/api/upload/verify", {
        body: { url: BLOB, mimeType: "application/pdf" }, // …claiming to be a PDF
      }),
    );

    expect(res.status).toBe(400);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("refuses a non-blob host so the route can't be used as a fetch proxy", async () => {
    mockSession({ id: "u1", name: "Tracie", role: "staff" });
    mockBlobBody(PDF_BYTES);

    const res = await POST(
      createRequest("POST", "/api/upload/verify", {
        body: { url: "https://internal.example.com/secret", mimeType: "application/pdf" },
      }),
    );

    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("400s on a MIME type outside the allow-list", async () => {
    mockSession({ id: "u1", name: "Tracie", role: "staff" });
    mockBlobBody(PDF_BYTES);

    const res = await POST(
      createRequest("POST", "/api/upload/verify", {
        body: { url: BLOB, mimeType: "application/x-msdownload" },
      }),
    );

    expect(res.status).toBe(400);
  });

  it.each([
    "http://abc123.public.blob.vercel-storage.com/file.pdf",
    "https://user@abc123.public.blob.vercel-storage.com/file.pdf",
    "https://abc123.public.blob.vercel-storage.com:8443/file.pdf",
    "https://abc123.public.blob.vercel-storage.com.evil.example/file.pdf",
  ])("refuses unsafe storage URL %s before fetching", async url => {
    mockSession({ id: "u1", name: "Synthetic educator", role: "staff" });
    mockBlobBody(PDF_BYTES);
    const res = await POST(createRequest("POST", "/api/upload/verify", { body: { url, mimeType: "application/pdf" } }));
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("bounds an upstream response that ignores Range and disables redirects", async () => {
    mockSession({ id: "u1", name: "Synthetic educator", role: "staff" });
    const cancel = vi.fn();
    const bytes = new Uint8Array(8192);
    bytes.set(PDF_BYTES);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(bytes); }, cancel,
    }))));
    const res = await POST(createRequest("POST", "/api/upload/verify", { body: { url: BLOB, mimeType: "application/pdf" } }));
    expect(res.status).toBe(200);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(BLOB, expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
  });

  it("handles failed or redirected downloads without deleting anything", async () => {
    mockSession({ id: "u1", name: "Synthetic educator", role: "staff" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("redirect blocked"); }));
    const res = await POST(createRequest("POST", "/api/upload/verify", { body: { url: BLOB, mimeType: "application/pdf" } }));
    expect(res.status).toBe(400);
    expect(deleteFile).not.toHaveBeenCalled();
  });
});

// ── Recording context (Phase 2, 2026-08-31) ─────────────────────────────

describe("POST /api/upload/verify — recording context", () => {
  const WEBM_BYTES = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00]);
  const RECORDING_BLOB =
    "https://abc123.public.blob.vercel-storage.com/l10-recording.webm";

  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
    mockSession({ id: "u1", name: "Admin", role: "admin" });
  });

  it("accepts a recording MIME under context: recording", async () => {
    mockBlobBody(WEBM_BYTES);
    const res = await POST(
      createRequest("POST", "/api/upload/verify", {
        body: { url: RECORDING_BLOB, mimeType: "audio/webm", context: "recording" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("REJECTS a recording MIME in the default context — the recording lane must never widen the general one", async () => {
    mockBlobBody(WEBM_BYTES);
    const res = await POST(
      createRequest("POST", "/api/upload/verify", {
        body: { url: RECORDING_BLOB, mimeType: "audio/webm" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects mismatched recording bytes without deleting the recording", async () => {
    mockBlobBody(PNG_BYTES); // PNG bytes declared as audio
    const res = await POST(
      createRequest("POST", "/api/upload/verify", {
        body: { url: RECORDING_BLOB, mimeType: "audio/webm", context: "recording" },
      }),
    );
    expect(res.status).toBe(400);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("still accepts the default lane exactly as before (pdf)", async () => {
    mockBlobBody(PDF_BYTES);
    const res = await POST(
      createRequest("POST", "/api/upload/verify", {
        body: { url: BLOB, mimeType: "application/pdf" },
      }),
    );
    expect(res.status).toBe(200);
  });
});
