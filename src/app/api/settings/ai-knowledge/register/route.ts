/**
 * POST /api/settings/ai-knowledge/register
 *
 * Client-driven post-upload registration. The browser uploads file
 * bytes directly to Vercel Blob via @vercel/blob/client.upload(),
 * then immediately calls THIS endpoint with the resulting blob URL
 * so the KnowledgeSource row is created + indexed synchronously.
 *
 * Why this exists alongside the onUploadCompleted webhook on the
 * /upload route: the webhook can drop or delay under bulk fan-out
 * (Daniel reported uploads "not actually getting uploaded within
 * the dashboard"). The client knows authoritatively when its upload
 * finished, so having it ping us directly removes the unreliability.
 *
 * Idempotent: the row's externalId is `uploadExternalId(blobUrl)` —
 * the SAME string the webhook derives — so whichever of the two lands
 * second hits the pipeline's hash fast-path and reports "unchanged"
 * instead of creating a duplicate or re-embedding identical text.
 *
 * Zips are the webhook's: it unzips and registers one source PER
 * ENTRY. Registering the zip here as well would flatten it into a
 * second, combined source, so `.zip` short-circuits without fetching.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { extractText } from "@/lib/document-indexer";
import { createManualSource, inferCategory, uploadExternalId } from "@/lib/knowledge/adapters/manual";
import { logger } from "@/lib/logger";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { safeAttachmentUrl } from "@/lib/schemas/message-attachments";

const ZIP_MIMES = new Set(["application/zip", "application/x-zip-compressed", "multipart/x-zip"]);

const schema = z.object({
  // Blob-host allow-list: the URL is fetched server-side AND stored as the
  // entry's citation link, so an arbitrary https URL is never accepted.
  blobUrl: safeAttachmentUrl,
  fileName: z.string().min(1),
  title: z.string().min(1),
  mimeType: z.string().min(1),
  /** Advisory only — the console sends it; nothing here reads it. */
  fileSize: z.number().int().min(0).optional(),
});

// Per-call cap matches the upload route — extraction + chunking can
// take 10–30s on a big PDF, so leave headroom.
export const maxDuration = 120;

export const POST = withApiAuth(
  async (req, session) => {
    const body = await parseJsonBody(req);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const { blobUrl, fileName, title, mimeType } = parsed.data;

    if (isZip(blobUrl, mimeType)) {
      logger.info("AI knowledge register: zip left to the upload webhook", { blobUrl, actorId: session!.user.id });
      return NextResponse.json({
        id: null,
        outcome: "unchanged",
        error: null,
        reason: "zip entries are registered by the upload webhook",
      });
    }

    // Auto-categorise from the filename — the SAME sniff the upload webhook
    // runs, so whichever of the two lands first sets the same category.
    const category = inferCategory(fileName, title);

    const text = await extractText(blobUrl, mimeType);

    const r = await createManualSource({
      title,
      text,
      externalUrl: blobUrl,
      externalId: uploadExternalId(blobUrl),
      category,
    });
    if (r.outcome === "error") {
      logger.error("AI knowledge register: indexing failed", {
        sourceId: r.sourceId,
        actorId: session!.user.id,
        err: r.error,
      });
    }
    return NextResponse.json({ id: r.sourceId, outcome: r.outcome, error: r.error ?? null });
  },
  // withApiAuth races the handler against a 55s default — a few seconds under
  // maxDuration so the wrapper, not the platform, reports the timeout.
  { roles: [...ADMIN_ROLES], timeoutMs: 110_000 },
);

/** Zip by extension (case-insensitive) or by the content type the console sent. */
function isZip(blobUrl: string, mimeType: string): boolean {
  return ZIP_MIMES.has(mimeType) || new URL(blobUrl).pathname.toLowerCase().endsWith(".zip");
}
