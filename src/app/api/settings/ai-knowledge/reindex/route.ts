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
    // 2026-06-17: pick up rows with indexError set too, not just
    // indexed=false. A failed extraction would otherwise sit there
    // forever even after the underlying issue is fixed.
    const stuck = await prisma.document.findMany({
      where: {
        OR: [
          { fileUrl: { contains: "/ai-knowledge/" } },
          { fileUrl: "internal://knowledge" },
        ],
        AND: [
          {
            OR: [
              { indexed: false },
              { indexError: { not: null } },
            ],
          },
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
      } catch (err) {
        // indexDocument is supposed to catch its own errors and set
        // indexError, but cover the case where it throws anyway.
        failed += 1;
        failures.push({
          title: d.title,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      // 2026-06-17: indexDocument catches its own failures and sets
      // indexError instead of throwing. Re-read the row after the
      // call so we report the true outcome — earlier the loop just
      // bumped `done` regardless of whether indexing actually worked,
      // so "30/30" was lying when PDFs hit "DOMMatrix is not defined".
      const refreshed = await prisma.document.findUnique({
        where: { id: d.id },
        select: { indexed: true, indexError: true },
      });
      if (refreshed?.indexed) {
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
      } else {
        failed += 1;
        failures.push({
          title: d.title,
          error: refreshed?.indexError ?? "Unknown indexer failure",
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
