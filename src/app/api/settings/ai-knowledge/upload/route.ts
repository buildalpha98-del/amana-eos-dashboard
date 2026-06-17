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
import { put } from "@vercel/blob";
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
  // 2026-06-15: zip support — server unzips on receipt and processes
  // each supported entry (PDF/DOCX/...) individually. Lets coordinators
  // drop one .zip of policies instead of 30 separate files.
  "application/zip",
  "application/x-zip-compressed",
  "multipart/x-zip",
  // Catch-all for browsers that don't sniff a content-type from the
  // file extension (some macOS Chrome builds tag .zip as
  // octet-stream). The actual file type is re-verified by the
  // extractor + chunker downstream, so accepting octet-stream here
  // doesn't bypass safety.
  "application/octet-stream",
];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB — handles even big handbooks

// Per-entry mime detection for entries inside a zip — Vercel Blob
// doesn't sniff content types from filenames the way the browser does.
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  md: "text/markdown",
};

// 2026-06-15: zip extraction can produce 30+ files. Raise the
// serverless timeout so the webhook can land them all. Per-entry
// indexing is fired in parallel but still adds up.
export const maxDuration = 300;

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
            // 2026-06-17: every upload gets a unique blob path. Without
            // this, re-uploading a file with the same name errors
            // with "this blob already exists".
            addRandomSuffix: true,
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
        // chunking pipeline. When the uploaded blob is a zip, unzip
        // it on the server and process each supported entry
        // individually so 30+ policies land from a single drop.
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          try {
            const meta = tokenPayload
              ? (JSON.parse(tokenPayload) as {
                  uploadedById?: string;
                  title?: string;
                })
              : {};

            const isZip =
              blob.contentType === "application/zip" ||
              blob.contentType === "application/x-zip-compressed" ||
              blob.pathname.toLowerCase().endsWith(".zip");

            if (isZip) {
              await processZipUpload(blob.url, meta.uploadedById);
              return;
            }

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

/**
 * Unzip an uploaded archive and ingest each supported entry. Entries
 * land in Vercel Blob as individual files, get their own Document
 * row, and are indexed in parallel (capped concurrency).
 *
 * Skips:
 *  - directories
 *  - macOS resource fork files (__MACOSX/, ._foo)
 *  - any extension not in EXT_TO_MIME (so a stray .keynote in a zip
 *    doesn't end up as opaque junk in the knowledge base)
 *
 * Fire-and-forget per-entry: each entry's full lifecycle (upload to
 * blob → create Document → index) runs in a batched Promise.all so
 * one slow PDF doesn't block the rest. Errors per entry are caught
 * + logged so a single bad file doesn't drop the whole batch.
 */
async function processZipUpload(
  zipUrl: string,
  uploadedById: string | undefined,
) {
  const JSZip = (await import("jszip")).default;
  const buf = await fetch(zipUrl).then((r) => r.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);

  const entries: { name: string; mime: string; bytes: ArrayBuffer }[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (path.startsWith("__MACOSX/")) continue;
    const base = path.split("/").pop() ?? path;
    if (base.startsWith("._") || base === ".DS_Store") continue;
    const ext = base.split(".").pop()?.toLowerCase() ?? "";
    const mime = EXT_TO_MIME[ext];
    if (!mime) continue;
    const bytes = await entry.async("arraybuffer");
    entries.push({ name: base, mime, bytes });
  }

  logger.info("AI knowledge: unzipped", {
    zipUrl,
    entryCount: entries.length,
  });

  // Concurrency cap — embedding API + DB writes shouldn't be fanned
  // out unbounded.
  const BATCH = 4;
  for (let i = 0; i < entries.length; i += BATCH) {
    const slice = entries.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (entry) => {
        try {
          const innerBlob = await put(
            `ai-knowledge/${entry.name}`,
            entry.bytes,
            { access: "public", contentType: entry.mime, addRandomSuffix: true },
          );
          const created = await prisma.document.create({
            data: {
              title: entry.name.replace(/\.[^.]+$/, ""),
              description: null,
              category: "other",
              fileName: entry.name,
              fileUrl: innerBlob.url,
              fileSize: entry.bytes.byteLength,
              mimeType: entry.mime,
              uploadedById: uploadedById ?? null,
            },
          });
          await indexDocument(created.id);
          const firstChunk = await prisma.documentChunk.findFirst({
            where: { documentId: created.id },
            orderBy: { chunkIndex: "asc" },
            select: { content: true },
          });
          if (firstChunk) {
            await prisma.document.update({
              where: { id: created.id },
              data: { description: firstChunk.content.slice(0, 280) },
            });
          }
          logger.info("AI knowledge: zip entry indexed", {
            id: created.id,
            entry: entry.name,
          });
        } catch (err) {
          logger.error("AI knowledge: zip entry failed", {
            entry: entry.name,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }
}
