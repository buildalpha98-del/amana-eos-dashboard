import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { validateFileContent } from "@/lib/file-validation";
import { isStoredFileUrl } from "@/lib/blob-proxy";
import { readResponsePrefix } from "@/lib/read-response-prefix";
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
 * stored object and run the same `validateFileContent`. Callers must not
 * persist a blob URL until this returns ok. This endpoint NEVER deletes:
 * a caller-provided URL is not proof of upload ownership. Cleanup requires
 * a separate server-owned pending-upload lifecycle.
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

  // This is a destination guard, not proof of ownership or upload approval.
  // Reject credentials, non-HTTPS schemes and non-standard ports as well.
  if (!isStoredFileUrl(url)) {
    throw ApiError.badRequest("Not a blob-storage URL");
  }

  let head: Buffer;
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${HEAD_BYTES - 1}` },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw ApiError.badRequest("Could not read uploaded file");
    }
    head = await readResponsePrefix(res, HEAD_BYTES);
  } catch {
    throw ApiError.badRequest("Could not read uploaded file");
  }

  if (!validateFileContent(Uint8Array.from(head).buffer, mimeType)) {
    logger.warn("upload/verify: content did not match declared type", {
      mimeType,
      userId: session!.user.id,
    });
    throw ApiError.badRequest("File content does not match declared type");
  }

  return NextResponse.json({ ok: true, url });
});
