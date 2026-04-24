/**
 * Tests for POST /api/upload/image — the parent-post photo uploader.
 *
 * Covers the hardened pipeline: MIME allowlist, 5 MB cap, magic-byte check,
 * and sharp re-encode (EXIF strip). The sharp module is mocked to avoid
 * bringing the libvips binary into the unit-test sandbox.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

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

// sharp mock — returns plausible re-encoded bytes per target format.
vi.mock("sharp", () => {
  const factory = () => ({
    rotate: () => ({
      jpeg: () => ({
        toBuffer: async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]),
      }),
      png: () => ({
        toBuffer: async () =>
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      }),
      webp: () => ({
        toBuffer: async () =>
          Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      }),
    }),
  });
  return { default: factory };
});

import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { POST } from "@/app/api/upload/image/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

function jpegBytes(size = 10): BlobPart {
  const out = new Uint8Array(size);
  out[0] = 0xff;
  out[1] = 0xd8;
  out[2] = 0xff;
  out[3] = 0xe0;
  return out as BlobPart;
}

function createFormDataRequest(formData: FormData): NextRequest {
  return new NextRequest(
    new Request("http://localhost:3000/api/upload/image", {
      method: "POST",
      body: formData,
    }),
  );
}

describe("POST /api/upload/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    mockUpload.mockResolvedValue({
      url: "https://abc.public.blob.vercel-storage.com/foo.jpg",
      size: 1024,
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const fd = new FormData();
    fd.append("file", new File([jpegBytes()], "a.jpg", { type: "image/jpeg" }));
    const res = await POST(createFormDataRequest(fd), {});
    expect(res.status).toBe(401);
  });

  it("rejects files larger than 5MB", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    fd.append(
      "file",
      new File([jpegBytes(5 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" }),
    );
    const res = await POST(createFormDataRequest(fd), {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/5MB/i);
  });

  it("returns 400 for non-image MIME (text/plain)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    fd.append("file", new File(["hello"], "note.txt", { type: "text/plain" }));
    const res = await POST(createFormDataRequest(fd), {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not allowed/i);
  });

  it("rejects image/heif (dropped from allowlist)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    fd.append("file", new File([jpegBytes()], "x.heif", { type: "image/heif" }));
    const res = await POST(createFormDataRequest(fd), {});
    expect(res.status).toBe(400);
  });

  it("returns 400 when magic bytes don't match MIME (PNG disguised as JPEG)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    fd.append(
      "file",
      new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]) as BlobPart],
        "fake.jpg",
        { type: "image/jpeg" },
      ),
    );
    const res = await POST(createFormDataRequest(fd), {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/does not match/i);
  });

  it("uploads a valid JPEG through the sharp pipeline", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const fd = new FormData();
    fd.append("file", new File([jpegBytes()], "photo.jpg", { type: "image/jpeg" }));
    const res = await POST(createFormDataRequest(fd), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\//);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    const [, uniqueName, opts] = mockUpload.mock.calls[0];
    expect(uniqueName).toMatch(/\.jpg$/);
    expect(opts.folder).toBe("parent-posts");
    expect(opts.access).toBe("public");
  });
});
