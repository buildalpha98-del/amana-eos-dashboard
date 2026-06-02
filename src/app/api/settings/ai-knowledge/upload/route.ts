/**
 * POST /api/settings/ai-knowledge/upload
 *
 * Client-direct upload coordinator for AI knowledge files. Uses the
 * Vercel Blob `handleUpload` pattern so the FILE BYTES go browser →
 * Blob directly, bypassing the serverless function body-size limit
 * (~4.5 MB on the platform). This route only handles two short
 * exchanges:
 *
 *   1. `onBeforeGenerateToken` — validates the requested filename +
 *      content type + size cap, mints a single-use upload token for
 *      the client.
 *   2. `onUploadCompleted` — receives a Vercel webhook AFTER the
 *      client has finished uploading to Blob. Creates the Document
 *      row pointing at the new blob URL and runs the existing
 *      `indexDocument()` pipeline to extract text + chunk + index.
 *
 * The client never POSTs the file bytes through this route, so we
 * can comfortably accept 50 MB+ files. The pattern is documented in
 * the Vercel Blob client docs.
 *
 * Auth: only owner/head_office/admin can call this. The session
 * snapshot is embedded in `tokenPayload` so the post-upload webhook
 * (which has no session cookie) can still attribute the upload.
 *
 * 2026-06-02.
 */

import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { indexDocument } from "@/lib/document-indexer";
import { logger } from "@/lib/logger";

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB — handles even big handbooks

export const POST = withApiAuth(
  async (req, session) => {
    const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
    if (!body) {
      throw ApiError.badRequest("Missing upload payload");
    }

    try {
      const jsonResponse = await handleUpload({
        body,
        request: req,
        // Phase 1: token generation. Runs while the user still has a
        // session; we validate + embed an attribution payload that
        // the webhook half can read once upload completes.
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          // clientPayload carries the title the admin typed. Wrap in
          // a try because it's user input through the client lib.
          let title = pathname.split("/").pop() ?? "Knowledge file";
          if (clientPayload) {
            try {
              const parsed = JSON.parse(clientPayload) as {
                title?: string;
              };
              if (parsed.title) title = parsed.title;
            } catch {
              // ignore — fall through to filename
            }
          }

          return {
            allowedContentTypes: ALLOWED_CONTENT_TYPES,
            maximumSizeInBytes: MAX_FILE_SIZE,
            // Stash the actor + title for the webhook half. JSON-encoded
            // because tokenPayload is `string | undefined`.
            tokenPayload: JSON.stringify({
              uploadedById: session!.user.id,
              title,
            }),
          };
        },
        // Phase 2: the post-upload webhook from Vercel Blob. Creates
        // the Document row and runs the existing extraction +
        // chunking pipeline.
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          try {
            const meta = tokenPayload
              ? (JSON.parse(tokenPayload) as {
                  uploadedById?: string;
                  title?: string;
                })
              : {};

            const fileName = blob.pathname.split("/").pop() ?? blob.pathname;
            const created = await prisma.document.create({
              data: {
                title: meta.title || fileName,
                description: null, // populated post-extraction
                category: "other",
                fileName,
                fileUrl: blob.url,
                fileSize: 0, // blob doesn't expose size at this stage; refreshed by indexer
                mimeType: blob.contentType ?? "application/octet-stream",
                uploadedById: meta.uploadedById ?? null,
              },
            });

            await indexDocument(created.id);

            // Backfill the description preview from the first chunk
            // (post-extraction) so the list card has something to show.
            const firstChunk = await prisma.documentChunk.findFirst({
              where: { documentId: created.id },
              orderBy: { chunkIndex: "asc" },
              select: { content: true, tokenCount: true },
            });
            if (firstChunk) {
              await prisma.document.update({
                where: { id: created.id },
                data: { description: firstChunk.content.slice(0, 280) },
              });
            }

            logger.info("AI knowledge file uploaded + indexed", {
              id: created.id,
              title: meta.title,
              blobUrl: blob.url,
              contentType: blob.contentType,
            });
          } catch (err) {
            // onUploadCompleted runs as a webhook — if we throw here
            // the upload still succeeded but the Document row never
            // got created, leaving an orphan blob. Log loud so we can
            // tell.
            logger.error("AI knowledge: onUploadCompleted failed", {
              blobUrl: blob.url,
              err: err instanceof Error ? err.message : String(err),
            });
            throw err;
          }
        },
      });

      return NextResponse.json(jsonResponse);
    } catch (err) {
      // handleUpload returns a Response-style error envelope when
      // validation fails (e.g. file too big, wrong content-type). We
      // unwrap it to surface a clean message to the client.
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("AI knowledge upload coordinator rejected request", {
        err: message,
      });
      throw ApiError.badRequest(message);
    }
  },
  { roles: ["owner", "head_office", "admin"] },
);
