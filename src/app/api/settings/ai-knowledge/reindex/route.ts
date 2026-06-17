/**
 * POST /api/settings/ai-knowledge/reindex — kick the indexer on
 * every AI Knowledge file that isn't indexed yet (indexed=false).
 *
 * Useful when a bulk zip upload partially completes: the file lands
 * + the Document row exists, but the per-file indexDocument() call
 * timed out or never fired. Coordinator can hit this once after the
 * upload settles and any stuck rows will pick up.
 *
 * Sequential per-file with try/catch around each — one bad file
 * shouldn't block the rest. Bumped maxDuration to 300s to give
 * room for a big backlog.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { indexDocument } from "@/lib/document-indexer";
import { logger } from "@/lib/logger";

export const maxDuration = 300;

export const POST = withApiAuth(
  async () => {
    const stuck = await prisma.document.findMany({
      where: {
        indexed: false,
        OR: [
          { fileUrl: { contains: "/ai-knowledge/" } },
          { fileUrl: "internal://knowledge" },
        ],
      },
      select: { id: true, title: true, fileName: true },
    });

    logger.info("AI knowledge reindex requested", { stuckCount: stuck.length });

    let done = 0;
    let failed = 0;
    const failures: { title: string; error: string }[] = [];

    for (const d of stuck) {
      try {
        await indexDocument(d.id);
        // Backfill the description preview from the first chunk so
        // freshly-indexed rows have something to show in the list.
        const firstChunk = await prisma.documentChunk.findFirst({
          where: { documentId: d.id },
          orderBy: { chunkIndex: "asc" },
          select: { content: true },
        });
        if (firstChunk) {
          await prisma.document.update({
            where: { id: d.id },
            data: { description: firstChunk.content.slice(0, 280) },
          });
        }
        done += 1;
      } catch (err) {
        failed += 1;
        failures.push({
          title: d.title,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      checked: stuck.length,
      done,
      failed,
      failures,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
