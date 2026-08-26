"use client";

import { upload } from "@vercel/blob/client";
import {
  ABSOLUTE_MAX_UPLOAD,
  SERVERLESS_BODY_LIMIT,
  describeOversizeError,
  isCompressibleImage,
  needsDirectUpload,
} from "@/lib/upload-strategy";

/**
 * One entry point for "put this file somewhere and give me a URL".
 *
 * Replaces bare `fetch("/api/upload")` calls, which 413'd on anything over
 * ~4.5 MB — Vercel rejects oversize request bodies at the edge, so the route
 * never ran and the browser got a status code with no message. Staff
 * photographing or scanning a WWCC hit that constantly.
 *
 * Three things happen here, in order:
 *   1. Photos are downscaled in the browser, which puts the overwhelming
 *      majority of uploads back under the serverless limit.
 *   2. Anything still over it goes straight to Blob storage, bypassing the cap.
 *   3. Direct uploads are then verified server-side, because bytes that skip
 *      our server can't be sniffed on the way in.
 */

const MAX_IMAGE_DIMENSION = 2200; // ample for reading a certificate
const JPEG_QUALITY = 0.82;

/**
 * Downscale an image via canvas and re-encode as JPEG. Returns the original
 * file untouched if it is already small, is not a canvas-decodable type, or if
 * decoding fails for any reason — compression is an optimisation, never a
 * precondition for uploading.
 */
export async function compressImage(file: File): Promise<File> {
  if (!isCompressibleImage(file.type)) return file;
  if (file.size <= SERVERLESS_BODY_LIMIT / 4) return file; // already small

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file; // no gain — keep original

    const renamed = file.name.replace(/\.[^./\\]+$/, "") + ".jpg";
    return new File([blob], renamed, { type: "image/jpeg" });
  } catch {
    return file; // e.g. HEIC outside Safari — fall through to size routing
  }
}

export type UploadResult = {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

/**
 * Upload `file`, choosing the route that will actually succeed for its size.
 * Throws an `Error` whose message is safe to show the user.
 */
export async function uploadFileSmart(input: File): Promise<UploadResult> {
  const file = await compressImage(input);

  const oversize = describeOversizeError(file.size);
  if (oversize) throw new Error(oversize);

  if (!needsDirectUpload(file.size)) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `Upload failed (${res.status})`);
    }
    const data = await res.json();
    if (!data?.fileUrl) throw new Error("Upload completed but no file URL was returned");
    return { fileUrl: data.fileUrl, fileName: file.name, fileSize: file.size, mimeType: file.type };
  }

  // Over the serverless cap — PUT straight to Blob storage.
  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/upload/blob-token",
    contentType: file.type,
  });

  // The bytes never crossed our server, so sniff them now. A blob that fails
  // verification is deleted server-side; surface the reason to the user.
  const verify = await fetch("/api/upload/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: blob.url, mimeType: file.type }),
  });
  if (!verify.ok) {
    const body = await verify.json().catch(() => ({}));
    throw new Error(body?.error ?? "Uploaded file failed verification");
  }

  return { fileUrl: blob.url, fileName: file.name, fileSize: file.size, mimeType: file.type };
}

export { ABSOLUTE_MAX_UPLOAD };
