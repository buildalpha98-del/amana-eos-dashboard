import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
const mockUpload = vi.fn();
vi.mock("@/lib/storage", () => ({ uploadFile: (...args: unknown[]) => mockUpload(...args) }));
// A serverless deployment cannot write into its application directory.
vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockRejectedValue(new Error("EROFS: read-only file system")),
  writeFile: vi.fn().mockRejectedValue(new Error("EROFS: read-only file system")),
}));
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { POST } from "@/app/api/content-uploads/route";

function upload(type = "image/jpeg", bytes: BlobPart = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])) {
  const form = new FormData();
  form.append("file", new File([bytes], "school-map", { type }));
  return POST(new NextRequest(new Request("http://localhost:3000/api/content-uploads", {
    method: "POST", body: form,
  })), { params: Promise.resolve({}) });
}

describe("parent-facing content uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    mockSession({ id: "owner-test", name: "Test", role: "owner" });
    mockUpload.mockResolvedValue({ url: "https://example.public.blob.vercel-storage.com/map.jpg", size: 4 });
  });

  it.each([
    ["image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
    ["application/pdf", new TextEncoder().encode("%PDF-1.4\n")],
  ])("stores a %s map when the deployment filesystem is read-only", async (type, bytes) => {
    const response = await upload(type, bytes as BlobPart);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://example.public.blob.vercel-storage.com/map.jpg" });
    expect(mockUpload).toHaveBeenCalledWith(Buffer.from(bytes), expect.any(String), {
      folder: "uploads/content", contentType: type, access: "public",
    });
  });

  it("rejects anonymous uploads", async () => {
    mockNoSession();
    expect((await upload()).status).toBe(401);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rejects non-admin uploads", async () => {
    mockSession({ id: "member-test", name: "Test", role: "member" });
    expect((await upload()).status).toBe(403);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rejects disguised file content before storage", async () => {
    expect((await upload("image/jpeg", "not an image")).status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("does not report a successful upload when storage fails", async () => {
    mockUpload.mockRejectedValueOnce(new Error("Storage unavailable"));
    expect((await upload()).status).toBe(500);
  });
});
