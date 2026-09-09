import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import {
  ABSOLUTE_MAX_UPLOAD,
  RECORDING_ALLOWED_MIMES,
  RECORDING_MAX_UPLOAD,
  UPLOAD_ALLOWED_MIMES,
} from "@/lib/upload-strategy";

/**
 * POST /api/upload/blob-token
 *
 * Issues a short-lived client token so the browser can PUT a file straight to
 * Vercel Blob, bypassing the ~4.5 MB serverless request-body cap that made
 * `/api/upload` return a bare 413 for scanned certificates and phone photos.
 *
 * Only files ABOVE `SERVERLESS_BODY_LIMIT` come through here — smaller ones
 * still go to `/api/upload`, which sniffs magic bytes server-side. A direct
 * upload never passes through our server, so the bytes cannot be sniffed on
 * the way in; the client must call `/api/upload/verify` afterwards, which
 * range-reads the stored object and deletes it if the content does not match
 * its declared type. Content type and size are additionally pinned into the
 * token below and enforced by Blob itself at the storage edge.
 */
export const POST = withApiAuth(async (req, session) => {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // 2026-08-31: the recording lane (meeting audio/video) has its own
        // allow-list and a 500 MB ceiling. Default lane byte-identical.
        let isRecording = false;
        if (clientPayload) {
          try {
            isRecording =
              (JSON.parse(clientPayload) as { context?: string }).context ===
              "recording";
          } catch {
            // Malformed payload — treat as default lane.
          }
        }
        return {
          allowedContentTypes: isRecording
            ? [...RECORDING_ALLOWED_MIMES]
            : [...UPLOAD_ALLOWED_MIMES],
          maximumSizeInBytes: isRecording
            ? RECORDING_MAX_UPLOAD
            : ABSOLUTE_MAX_UPLOAD,
          addRandomSuffix: true,
          // Carried through to onUploadCompleted for the audit trail.
          tokenPayload: JSON.stringify({ userId: session!.user.id }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        logger.info("Direct blob upload completed", {
          url: blob.url,
          userId: session!.user.id,
        });
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    // handleUpload throws on a rejected content type / oversize / bad token.
    // Surface the reason rather than letting it become an opaque 500.
    const message = err instanceof Error ? err.message : "Upload token failed";
    logger.warn("Direct blob upload token rejected", {
      userId: session!.user.id,
      err: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
