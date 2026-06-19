/**
 * POST /api/audits/templates/upload
 *
 * Client-direct upload coordinator for audit template DOCX files.
 * Same Vercel Blob handleUpload pattern as the AI knowledge upload
 * route — file bytes go browser → Blob, this route only mints the
 * token + reports back. No Document/Template row is created here;
 * the caller follows up with POST /api/audits/templates after the
 * upload completes (client knows the blob URL).
 *
 * Owner / head_office / admin only.
 */

import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const ALLOWED_CONTENT_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  // macOS Chrome sometimes reports docx as octet-stream — accept it
  // and verify on the server side at edit-time.
  "application/octet-stream",
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export const POST = withApiAuth(
  async (req) => {
    const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
    if (!body) throw ApiError.badRequest("Missing upload payload");

    try {
      const jsonResponse = await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async () => ({
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_FILE_SIZE,
          // Unique blob path per upload so a re-uploaded same-name file
          // doesn't 409 against the existing object.
          addRandomSuffix: true,
        }),
        onUploadCompleted: async ({ blob }) => {
          logger.info("Audit template DOCX uploaded", {
            blobUrl: blob.url,
            contentType: blob.contentType,
          });
        },
      });
      return NextResponse.json(jsonResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("Audit template upload rejected", { err: message });
      throw ApiError.badRequest(message);
    }
  },
  { roles: ["owner", "head_office", "admin"] },
);
