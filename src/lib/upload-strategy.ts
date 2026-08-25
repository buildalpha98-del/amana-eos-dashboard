/**
 * Where an upload should go, and how big it is allowed to be.
 *
 * Pure and dependency-free so both the browser helper (`upload-client.ts`) and
 * the server routes agree on one set of numbers.
 *
 * Background — 2026-08-25: staff uploading a WWCC saw "Upload failed (413)".
 * `/api/upload` advertised a 10 MB limit, but a Vercel serverless function
 * rejects any request body over ~4.5 MB at the platform edge, before the
 * handler runs. Everything in that gap failed with an opaque status and no
 * server log. Phone photos and scanned PDFs sit in that gap routinely, so in
 * practice the certificate uploader was unusable for a large share of staff.
 */

/**
 * Largest body we will send through a serverless route. Vercel's hard cap is
 * 4.5 MB; the headroom covers multipart framing and the JSON metadata part.
 */
export const SERVERLESS_BODY_LIMIT = 4 * 1024 * 1024;

/** Largest file we accept by any route — matches what the UI promises. */
export const ABSOLUTE_MAX_UPLOAD = 10 * 1024 * 1024;

/**
 * True when a file must bypass the serverless route and go straight to blob
 * storage. Direct uploads skip server-side magic-byte sniffing, so the caller
 * is expected to verify the stored object afterwards (see /api/upload/verify).
 */
export function needsDirectUpload(sizeBytes: number): boolean {
  return sizeBytes > SERVERLESS_BODY_LIMIT;
}

/**
 * Image types a browser canvas can reliably decode for downscaling.
 *
 * HEIC is deliberately excluded: only Safari decodes it, so a canvas round-trip
 * silently produces a blank image in Chrome and Firefox. iOS transcodes HEIC to
 * JPEG on file-picker selection in most cases anyway; whatever survives is
 * passed through and routed on size alone.
 */
const COMPRESSIBLE_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function isCompressibleImage(mime: string): boolean {
  return COMPRESSIBLE_IMAGE_MIMES.has(mime);
}

const asMb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;

/**
 * A human error for a file past the absolute cap, or "" when it is fine.
 * Returned before any network call so the user gets the actual numbers rather
 * than a bare 413 after waiting for a failed upload.
 */
export function describeOversizeError(sizeBytes: number): string {
  if (sizeBytes <= ABSOLUTE_MAX_UPLOAD) return "";
  return `That file is ${asMb(sizeBytes)}MB — the limit is ${asMb(ABSOLUTE_MAX_UPLOAD)}MB. Try photographing the document instead of scanning it, or reduce the PDF quality.`;
}

/**
 * MIME types accepted by every upload path.
 *
 * Shared by `/api/upload` (which additionally sniffs magic bytes) and
 * `/api/upload/blob-token` (which hands the list to Vercel Blob as
 * `allowedContentTypes`, enforced at the storage edge). Keeping one list
 * prevents the drift that previously let a type be accepted by one route and
 * rejected by the other.
 */
export const UPLOAD_ALLOWED_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  // iPhone defaults to HEIC for photos; staff uploading a photo of a cert
  // would otherwise hit a silent 400 here even though the image is valid.
  "image/heic",
  "image/heif",
  // Common scanner / older-camera formats — still legitimate cert photos.
  "image/tiff",
  "image/bmp",
] as const;
