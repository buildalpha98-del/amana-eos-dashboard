import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { validateFileContent } from "@/lib/file-validation";
import { deleteFile } from "@/lib/storage";
import { logger } from "@/lib/logger";
import {
  RECORDING_ALLOWED_MIMES,
  UPLOAD_ALLOWED_MIMES,
} from "@/lib/upload-strategy";

/**
 * POST /api/upload/verify
 *
 * Restores the magic-byte check for files that went straight to Blob storage.
 *
 * `/api/upload` sniffs content server-side, but a direct upload never touches
 * our server — so without this the >4 MB path would be the one route where a
 * file's declared type is taken on trust. Here we range-read the head of the
 * stored object, run the same `validateFileContent`, and delete the blob if it
 * lies. Callers must not persist a blob URL until this returns ok.
 */

// Enough for every signature we check; HEIC needs 12 bytes, SVG sniffs 200.
const HEAD_BYTES = 4096;

const verifySchema = z.object({
  url: z.string().url(),
  mimeType: z.string(),
  // 2026-08-31: the recording lane validates against its own allow-list.
  context: z.enum(["default", "recording"]).optional(),
});

export const POST = withApiAuth(async (req, session) => {
  const parsed = verifySchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0].message);
  }
  const { url, mimeType } = parsed.data;
  const allowed: readonly string[] =
    parsed.data.context === "recording"
      ? RECORDING_ALLOWED_MIMES
      : UPLOAD_ALLOWED_MIMES;
  if (!allowed.includes(mimeType)) {
    throw ApiError.badRequest(`Unsupported file type: ${mimeType}`);
  }

  // Only ever verify objects in our own blob store — never let a caller point
  // this at an arbitrary host and use the server as a fetch proxy.
  const host = new URL(url).hostname;
  if (!host.endsWith(".blob.vercel-storage.com")) {
    throw ApiError.badRequest("Not a blob-storage URL");
  }

  const res = await fetch(url, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` } });
  if (!res.ok) {
    throw ApiError.badRequest(`Could not read uploaded file (${res.status})`);
  }
  const head = await res.arrayBuffer();

  if (!validateFileContent(head, mimeType)) {
    // Remove the object so a rejected upload leaves nothing behind.
    try {
      await deleteFile(url);
    } catch (err) {
      logger.warn("upload/verify: could not delete rejected blob", {
        url,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    logger.warn("upload/verify: content did not match declared type", {
      url,
      mimeType,
      userId: session!.user.id,
    });
    throw ApiError.badRequest("File content does not match declared type");
  }

  return NextResponse.json({ ok: true, url });
});
