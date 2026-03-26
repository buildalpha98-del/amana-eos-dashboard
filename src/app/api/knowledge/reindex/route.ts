import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { indexDocument } from "@/lib/document-indexer";
import { logger } from "@/lib/logger";

/**
 * POST /api/knowledge/reindex — Reindex all non-deleted documents
 *
 * Auth: owner only
 * Timeout: 120s (2 min for large document sets)
 *
 * Sequential reindex with error collection per document.
 */
export const POST = withApiAuth(
  async () => {
    const documents = await prisma.document.findMany({
      where: { deleted: false },
      select: { id: true, title: true },
    });

    logger.info("Knowledge: starting full reindex", {
      documentCount: documents.length,
    });

    const errors: { documentId: string; title: string; error: string }[] = [];

    for (const doc of documents) {
      try {
        await indexDocument(doc.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ documentId: doc.id, title: doc.title, error: message });
        logger.error("Knowledge: reindex failed for document", {
          documentId: doc.id,
          err,
        });
      }
    }

    const totalChunks = await prisma.documentChunk.count();

    logger.info("Knowledge: reindex complete", {
      documentsProcessed: documents.length,
      totalChunks,
      errorCount: errors.length,
    });

    return NextResponse.json({
      documentsProcessed: documents.length,
      totalChunks,
      errors,
    });
  },
  { roles: ["owner"], timeoutMs: 120_000 },
);
