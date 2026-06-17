/**
 * POST /api/settings/ai-knowledge/backfill
 *
 * Recovery tool. Lists every blob under `ai-knowledge/` in Vercel
 * Blob storage and creates a Document row + runs indexing for any
 * that doesn't already have one.
 *
 * Necessary because earlier uploads relied on the onUploadCompleted
 * webhook which silently dropped work under bulk fan-out — the file
 * landed in storage but no Document row was ever created. This
 * endpoint walks storage and heals the gap.
 *
 * Idempotent — re-running matches 0 new rows once everything is
 * registered.
 */

import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { indexDocument } from "@/lib/document-indexer";
import { logger } from "@/lib/logger";

export const maxDuration = 300;

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  md: "text/markdown",
};

export const POST = withApiAuth(
  async (_req, session) => {
    // Paginate through every blob under ai-knowledge/.
    const blobs: { url: string; pathname: string; size: number }[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: "ai-knowledge/", cursor, limit: 1000 });
      blobs.push(
        ...page.blobs.map((b) => ({
          url: b.url,
          pathname: b.pathname,
          size: b.size,
        })),
      );
      cursor = page.cursor;
    } while (cursor);

    logger.info("AI knowledge backfill: blob inventory", {
      total: blobs.length,
    });

    // Which urls already have a Document row?
    const existing = await prisma.document.findMany({
      where: { fileUrl: { in: blobs.map((b) => b.url) } },
      select: { fileUrl: true },
    });
    const existingUrls = new Set(existing.map((d) => d.fileUrl));

    const missing = blobs.filter((b) => !existingUrls.has(b.url));

    let created = 0;
    let indexed = 0;
    let failed = 0;
    const failures: { fileName: string; error: string }[] = [];

    for (const b of missing) {
      try {
        const fileName = b.pathname.split("/").pop() ?? b.pathname;
        const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
        const mime = EXT_TO_MIME[ext];
        if (!mime) {
          failures.push({ fileName, error: `Unsupported extension: .${ext}` });
          failed += 1;
          continue;
        }
        const doc = await prisma.document.create({
          data: {
            title: fileName.replace(/\.[^.]+$/, ""),
            description: null,
            category: "other",
            fileName,
            fileUrl: b.url,
            fileSize: b.size,
            mimeType: mime,
            uploadedById: session.user.id,
          },
        });
        created += 1;
        try {
          await indexDocument(doc.id);
          const firstChunk = await prisma.documentChunk.findFirst({
            where: { documentId: doc.id },
            orderBy: { chunkIndex: "asc" },
            select: { content: true },
          });
          if (firstChunk) {
            await prisma.document.update({
              where: { id: doc.id },
              data: { description: firstChunk.content.slice(0, 280) },
            });
          }
          indexed += 1;
        } catch (err) {
          // Index error doesn't undo creation — the row still exists,
          // user sees the inline error and can act.
          failures.push({
            fileName,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } catch (err) {
        failed += 1;
        failures.push({
          fileName: b.pathname,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      totalInStorage: blobs.length,
      alreadyRegistered: existing.length,
      newlyCreated: created,
      newlyIndexed: indexed,
      failed,
      failures: failures.slice(0, 20), // cap for response size
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
