import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock @vercel/blob before importing the module under test.
const mockPut = vi.fn();
const mockDel = vi.fn();
vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => mockPut(...args),
  del: (...args: unknown[]) => mockDel(...args),
}));

import { uploadFile, deleteFile } from "@/lib/storage";

describe("uploadFile (lib/storage)", () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockDel.mockReset();
    mockPut.mockResolvedValue({ url: "https://blob.example.com/uploads/foo-123.pdf" });
  });

  it("defaults access to 'public' so the stored URL is openable by the browser", async () => {
    // Regression test for the documents "FORBIDDEN" bug:
    // previously the default was "private", which caused Vercel Blob to
    // return a 403 Forbidden page when the frontend opened the file URL.
    const buffer = Buffer.from("hello");
    await uploadFile(buffer, "report.pdf", { folder: "uploads" });

    expect(mockPut).toHaveBeenCalledTimes(1);
    const [pathArg, bodyArg, optsArg] = mockPut.mock.calls[0];
    expect(pathArg).toBe("uploads/report.pdf");
    expect(bodyArg).toBe(buffer);
    expect(optsArg.access).toBe("public");
  });

  it("allows callers to opt into 'private' access (e.g. sensitive backup dumps)", async () => {
    const buffer = Buffer.from("secret,data");
    await uploadFile(buffer, "backup-users-2026-04-20.csv", {
      folder: "backups",
      contentType: "text/csv",
      access: "private",
    });

    expect(mockPut).toHaveBeenCalledTimes(1);
    const [pathArg, , optsArg] = mockPut.mock.calls[0];
    expect(pathArg).toBe("backups/backup-users-2026-04-20.csv");
    expect(optsArg.access).toBe("private");
    expect(optsArg.contentType).toBe("text/csv");
  });

  it("uploads at the root when no folder is supplied", async () => {
    await uploadFile(Buffer.from("x"), "plain.txt");

    const [pathArg] = mockPut.mock.calls[0];
    expect(pathArg).toBe("plain.txt");
  });

  it("returns the blob url and the buffer size", async () => {
    mockPut.mockResolvedValueOnce({ url: "https://blob.example.com/foo.pdf" });
    const buffer = Buffer.from("abcdef");
    const result = await uploadFile(buffer, "foo.pdf");
    expect(result).toEqual({ url: "https://blob.example.com/foo.pdf", size: 6 });
  });

  it("forwards contentType and adds a random suffix to avoid collisions", async () => {
    await uploadFile(Buffer.from("x"), "avatar.png", {
      folder: "avatars",
      contentType: "image/png",
    });

    const [, , optsArg] = mockPut.mock.calls[0];
    expect(optsArg.contentType).toBe("image/png");
    expect(optsArg.addRandomSuffix).toBe(true);
  });
});

describe("deleteFile (lib/storage)", () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockDel.mockReset();
  });

  it("delegates to @vercel/blob del() with the given url", async () => {
    mockDel.mockResolvedValueOnce(undefined);
    await deleteFile("https://blob.example.com/uploads/foo.pdf");
    expect(mockDel).toHaveBeenCalledWith("https://blob.example.com/uploads/foo.pdf");
  });
});
