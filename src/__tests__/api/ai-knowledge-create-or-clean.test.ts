import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/api-error";

const { logger } = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({ logger }));

const { createManualSource, deleteFile } = vi.hoisted(() => ({
  createManualSource: vi.fn(),
  deleteFile: vi.fn(async (_url?: string) => undefined),
}));
vi.mock("@/lib/knowledge/adapters/manual", () => ({ createManualSource }));
vi.mock("@/lib/storage", () => ({ deleteFile }));

import { createManualSourceOrCleanBlob } from "@/app/api/settings/ai-knowledge/_lib/create-or-clean";

const BLOB = "https://abc123.public.blob.vercel-storage.com/ai-knowledge/x-y2.pdf";
const input = { title: "T", text: "body text", externalUrl: BLOB, externalId: "manual:upload:/ai-knowledge/x-y2.pdf" };

/**
 * Unit tests for the helper extracted to fix the 2026-09-27 orphaned-blob
 * review finding: a blob that never became a KnowledgeSource row (any
 * throw from createManualSource — the credential guard, or anything else)
 * must not sit orphaned in Vercel Blob storage. Shared by the register
 * route and the upload webhook's single-file path; the webhook's own
 * `onUploadCompleted` callback has no exported seam to test directly
 * (it's defined inline inside the `handleUpload` call), so this covers
 * the helper both routes delegate to instead.
 */
describe("createManualSourceOrCleanBlob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes through a successful create untouched, without deleting the blob", async () => {
    createManualSource.mockResolvedValueOnce({ sourceId: "k1", outcome: "created" });
    const result = await createManualSourceOrCleanBlob(input, BLOB);
    expect(result).toEqual({ sourceId: "k1", outcome: "created" });
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("deletes the blob and rethrows unchanged when createManualSource throws (the credential guard)", async () => {
    const err = ApiError.badRequest("This document appears to contain a password or key — remove it before adding it to the knowledge store");
    createManualSource.mockRejectedValueOnce(err);
    await expect(createManualSourceOrCleanBlob(input, BLOB)).rejects.toBe(err);
    expect(deleteFile).toHaveBeenCalledWith(BLOB);
  });

  it("also cleans up on a non-credential throw — any failure to create the row orphans the blob", async () => {
    const err = new Error("db down");
    createManualSource.mockRejectedValueOnce(err);
    await expect(createManualSourceOrCleanBlob(input, BLOB)).rejects.toBe(err);
    expect(deleteFile).toHaveBeenCalledWith(BLOB);
  });

  it("swallows a blob-deletion failure, logs it, and still rethrows the ORIGINAL error", async () => {
    const original = ApiError.badRequest("credential-shaped content");
    createManualSource.mockRejectedValueOnce(original);
    deleteFile.mockRejectedValueOnce(new Error("blob gone"));
    await expect(createManualSourceOrCleanBlob(input, BLOB)).rejects.toBe(original);
    expect(logger.warn).toHaveBeenCalledWith(
      "AI knowledge: blob cleanup failed after rejected upload",
      expect.objectContaining({ blobUrl: BLOB, err: "blob gone" }),
    );
  });
});
