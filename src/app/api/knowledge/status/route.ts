import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/knowledge/status — Knowledge base indexing status
 *
 * Returns document counts, chunk counts, last indexed timestamp, and any indexing errors.
 */
export const GET = withApiAuth(async () => {
  const [totalDocuments, indexedDocuments, totalChunks, lastIndexed, errors] =
    await Promise.all([
      prisma.document.count({ where: { deleted: false } }),
      prisma.document.count({ where: { deleted: false, indexed: true } }),
      prisma.documentChunk.count(),
      prisma.document.findFirst({
        where: { indexed: true, indexedAt: { not: null } },
        orderBy: { indexedAt: "desc" },
        select: { indexedAt: true },
      }),
      prisma.document.findMany({
        where: { deleted: false, indexError: { not: null } },
        select: { id: true, title: true, indexError: true },
      }),
    ]);

  return NextResponse.json({
    totalDocuments,
    indexedDocuments,
    totalChunks,
    lastIndexedAt: lastIndexed?.indexedAt?.toISOString() ?? null,
    errors,
  });
});
