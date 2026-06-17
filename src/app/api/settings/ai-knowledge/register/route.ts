/**
 * POST /api/settings/ai-knowledge/register
 *
 * Client-driven post-upload registration. The browser uploads file
 * bytes directly to Vercel Blob via @vercel/blob/client.upload(),
 * then immediately calls THIS endpoint with the resulting blob URL
 * so the Document row is created + indexed synchronously.
 *
 * Why this exists alongside the onUploadCompleted webhook on the
 * /upload route: the webhook can drop or delay under bulk fan-out
 * (Daniel reported uploads "not actually getting uploaded within
 * the dashboard"). The client knows authoritatively when its upload
 * finished, so having it ping us directly removes the unreliability.
 *
 * Idempotent — upserts the Document by fileUrl so a slow webhook
 * arriving after this register call won't create a duplicate.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { indexDocument } from "@/lib/document-indexer";
import { logger } from "@/lib/logger";

const schema = z.object({
  blobUrl: z.string().url(),
  fileName: z.string().min(1),
  title: z.string().min(1),
  mimeType: z.string().min(1),
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
    const { blobUrl, fileName, title, mimeType, fileSize } = parsed.data;

    // Upsert by fileUrl so the webhook arriving after us is a no-op.
    const existing = await prisma.document.findFirst({
      where: { fileUrl: blobUrl },
      select: { id: true },
    });

    const documentId = existing
      ? existing.id
      : (
          await prisma.document.create({
            data: {
              title,
              description: null,
              category: "other",
              fileName,
              fileUrl: blobUrl,
              fileSize: fileSize ?? 0,
              mimeType,
              uploadedById: session.user.id,
            },
            select: { id: true },
          })
        ).id;

    // Index inline so the client gets accurate feedback. If the
    // extractor errors, indexDocument writes indexError on the row
    // (we DON'T rethrow — the Document still exists, the user can
    // see the error inline and decide what to do).
    try {
      await indexDocument(documentId);
      const firstChunk = await prisma.documentChunk.findFirst({
        where: { documentId },
        orderBy: { chunkIndex: "asc" },
        select: { content: true },
      });
      if (firstChunk) {
        await prisma.document.update({
          where: { id: documentId },
          data: { description: firstChunk.content.slice(0, 280) },
        });
      }
    } catch (err) {
      logger.error("AI knowledge register: indexing failed", {
        documentId,
        err: err instanceof Error ? err.message : String(err),
      });
      // Swallow — the row exists with indexError set by indexDocument.
    }

    const final = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, indexed: true, indexError: true, _count: { select: { chunks: true } } },
    });

    return NextResponse.json({
      id: documentId,
      indexed: final?.indexed ?? false,
      indexError: final?.indexError ?? null,
      chunkCount: final?._count.chunks ?? 0,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
