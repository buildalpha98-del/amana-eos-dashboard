/**
 * Upload routing rules.
 *
 * 2026-08-25: staff uploading a WWCC hit "Upload failed (413)". Vercel caps a
 * serverless function's request body at 4.5 MB, but /api/upload advertised a
 * 10 MB limit — so anything between the two was rejected by the platform
 * before the route ran, with no usable error. Phone photos and scanned PDFs
 * land in that gap routinely.
 */
import { describe, it, expect } from "vitest";
import {
  SERVERLESS_BODY_LIMIT,
  ABSOLUTE_MAX_UPLOAD,
  needsDirectUpload,
  isCompressibleImage,
  describeOversizeError,
} from "@/lib/upload-strategy";

const MB = 1024 * 1024;

describe("SERVERLESS_BODY_LIMIT", () => {
  it("sits below Vercel's real 4.5MB request-body cap", () => {
    expect(SERVERLESS_BODY_LIMIT).toBeLessThan(4.5 * MB);
  });
});

describe("needsDirectUpload", () => {
  it("routes a small file through the validating server route", () => {
    expect(needsDirectUpload(500 * 1024)).toBe(false);
  });
  it("routes a file at the limit through the server route", () => {
    expect(needsDirectUpload(SERVERLESS_BODY_LIMIT)).toBe(false);
  });
  it("routes an over-limit file direct to blob storage", () => {
    // The exact case that 413'd: a 6 MB scanned WWCC PDF.
    expect(needsDirectUpload(6 * MB)).toBe(true);
  });
});

describe("isCompressibleImage", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])(
    "%s can be downscaled in-browser",
    (mime) => expect(isCompressibleImage(mime)).toBe(true),
  );
  it.each(["application/pdf", "image/heic", "text/csv"])(
    "%s cannot be canvas-decoded reliably, so it is passed through",
    (mime) => expect(isCompressibleImage(mime)).toBe(false),
  );
});

describe("describeOversizeError", () => {
  it("names the actual size and the cap instead of a bare status code", () => {
    const msg = describeOversizeError(12 * MB);
    expect(msg).toContain("12");
    expect(msg).toContain("10");
  });
  it("is empty for a file within the absolute cap", () => {
    expect(describeOversizeError(ABSOLUTE_MAX_UPLOAD)).toBe("");
  });
});
