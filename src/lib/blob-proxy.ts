/**
 * Same-origin streaming proxy for files held in Vercel Blob storage.
 *
 * WHY THIS EXISTS (2026-09-15). Every HR file proxy used to answer with
 * `NextResponse.redirect(blobUrl)`. That works for a top-level navigation
 * ("Open in new tab") and fails for an `<iframe>`: the app's CSP sets no
 * `frame-src`, so it falls back to `default-src 'self'`, and the browser
 * checks EVERY hop of a redirect chain against it. The same-origin proxy
 * URL passed; the cross-origin Blob URL it redirected to did not, so the
 * in-app viewer rendered an error while the new-tab link worked. Staff
 * opening their contract hit exactly that.
 *
 * Streaming the bytes back ourselves keeps the whole exchange same-origin,
 * so no CSP hop is crossed. It also delivers what those routes always
 * claimed: "the client never sees the raw blob URL" — which a redirect
 * plainly does not do.
 *
 * The payslip proxy (api/my-portal/payslips/[payRunId]/download) already
 * streamed, which is precisely why it was the one PDF viewer that worked.
 *
 * Callers MUST do their own authorisation first — this helper only moves
 * bytes, it does not decide who may read them.
 */

import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const BLOB_HOSTS = new Set(["public.blob.vercel-storage.com"]);

/**
 * True when `url` points at our own Blob storage.
 *
 * This is an SSRF guard, not a formality: the helper fetches whatever it is
 * given from inside our own network, so a caller that forwards a
 * user-supplied URL must be refused. Mirrors `safeAttachmentUrl`
 * (src/lib/schemas/message-attachments.ts) — keep the two in step.
 */
export function isStoredFileUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:") return false;
    return BLOB_HOSTS.has(hostname) || hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/**
 * Header-safe filename. Quotes, backslashes and control characters would
 * break (or let a caller forge) the Content-Disposition header, so they are
 * stripped; a `filename*` parameter carries the original for UTF-8 names.
 */
function dispositionFor(fileName: string, attachment: boolean): string {
  const type = attachment ? "attachment" : "inline";
  const ascii = fileName.replace(/[\u0000-\u001f\u007f"\\]/g, "").trim();
  const safe = ascii.length > 0 ? ascii : "file";
  return `${type}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export interface StreamStoredFileOptions {
  /** Name shown to the browser when saving. */
  fileName: string;
  /** Force a save dialog instead of rendering in place. */
  download?: boolean;
  /** Used when Blob storage doesn't report a Content-Type. */
  fallbackContentType?: string;
}

/**
 * Fetch a stored file and stream it back over the same origin.
 *
 * The body is piped straight through rather than buffered: these are HR
 * documents (contracts, certificates, payslips), so they should sit in our
 * process memory no longer than the stream takes to pass.
 *
 * @throws ApiError.notFound when storage has no such object.
 */
export async function streamStoredFile(
  fileUrl: string,
  opts: StreamStoredFileOptions,
): Promise<NextResponse> {
  if (!isStoredFileUrl(fileUrl)) {
    logger.error("Refused to proxy a non-storage URL", { fileUrl });
    throw ApiError.notFound("File not found");
  }

  let upstream: Response;
  try {
    upstream = await fetch(fileUrl);
  } catch (err) {
    logger.error("Stored file fetch failed", { err, fileUrl });
    throw ApiError.notFound("File not found");
  }

  if (!upstream.ok || !upstream.body) {
    logger.warn("Stored file unavailable", { status: upstream.status, fileUrl });
    throw ApiError.notFound("File not found");
  }

  const headers: Record<string, string> = {
    "Content-Type":
      upstream.headers.get("content-type") ??
      opts.fallbackContentType ??
      "application/octet-stream",
    "Content-Disposition": dispositionFor(opts.fileName, opts.download === true),
    // HR documents: never let a shared or intermediary cache keep a copy.
    "Cache-Control": "private, no-store, no-cache, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  };
  const length = upstream.headers.get("content-length");
  if (length) headers["Content-Length"] = length;

  return new NextResponse(upstream.body, { status: 200, headers });
}
