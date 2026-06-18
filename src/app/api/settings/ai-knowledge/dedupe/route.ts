/**
 * POST /api/settings/ai-knowledge/dedupe
 *
 * Finds duplicate AI Knowledge files in the library and deletes
 * all but the newest indexed copy of each.
 *
 * Matching strategy (two passes):
 *   1. Exact fileName match — catches the typical "re-uploaded the
 *      same file twice" case. Most realistic source of duplicates
 *      after multiple Recover/Re-index runs.
 *   2. First-chunk content match within filename groups — if two
 *      docs share a filename AND the same first chunk, they're
 *      almost certainly the same content. Already implied by #1
 *      but documented in case we extend matching later.
 *
 * For each duplicate group, keep the row that:
 *   - has indexed=true if any do
 *   - then the one with the most recent indexedAt
 *   - tie-broken by most recent createdAt
 *
 * Cascade-deletes the chunks via the DocumentChunk → Document FK.
 * The blob in Vercel storage is NOT deleted (cheap to keep; deleting
 * would orphan any external link that pointed at it).
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

type DedupeDoc = {
  id: string;
  title: string;
  fileName: string | null;
  indexed: boolean;
  indexedAt: Date | null;
  createdAt: Date;
  chunks: { content: string }[];
};

export const POST = withApiAuth(
  async () => {
    const docs: DedupeDoc[] = await prisma.document.findMany({
      where: {
        OR: [
          { fileUrl: { contains: "/ai-knowledge/" } },
          { fileUrl: "internal://knowledge" },
        ],
      },
      select: {
        id: true,
        title: true,
        fileName: true,
        indexed: true,
        indexedAt: true,
        createdAt: true,
        chunks: {
          select: { content: true },
          orderBy: { chunkIndex: "asc" },
        },
      },
    });

    // 2026-06-17: dedupe by extracted content (SHA-256 over the
    // concatenated chunk text), not just filename. Catches renamed
    // duplicates ("Foo.docx" vs "Foo (1).docx") that the
    // filename-only key missed. Falls back to filename for docs
    // with no extracted text so they still group.
    const groups = new Map<string, DedupeDoc[]>();
    for (const d of docs) {
      const text = d.chunks
        .map((c) => c.content)
        .join("\n")
        .trim();
      const key = text
        ? `content:${createHash("sha256").update(text).digest("hex")}`
        : `name:${(d.fileName ?? d.title).toLowerCase()}`;
      const list = groups.get(key) ?? [];
      list.push(d);
      groups.set(key, list);
    }

    const toDelete: string[] = [];
    const kept: { id: string; fileName: string; copiesRemoved: number }[] = [];

    for (const [key, list] of groups) {
      if (list.length < 2) continue;
      // Best copy first: indexed wins, then newest indexedAt, then
      // newest createdAt.
      const sorted = [...list].sort((a, b) => {
        if (a.indexed !== b.indexed) return a.indexed ? -1 : 1;
        const aT = a.indexedAt?.getTime() ?? 0;
        const bT = b.indexedAt?.getTime() ?? 0;
        if (aT !== bT) return bT - aT;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
      const [winner, ...losers] = sorted;
      kept.push({
        id: winner.id,
        fileName: winner.fileName ?? winner.title,
        copiesRemoved: losers.length,
      });
      toDelete.push(...losers.map((l) => l.id));
      logger.info("AI knowledge dedupe: collapsing group", {
        key,
        kept: winner.id,
        removed: losers.map((l) => l.id),
      });
    }

    if (toDelete.length === 0) {
      return NextResponse.json({
        scanned: docs.length,
        duplicateGroups: 0,
        removed: 0,
        kept: [],
      });
    }

    await prisma.documentChunk.deleteMany({
      where: { documentId: { in: toDelete } },
    });
    await prisma.document.deleteMany({
      where: { id: { in: toDelete } },
    });

    return NextResponse.json({
      scanned: docs.length,
      duplicateGroups: kept.length,
      removed: toDelete.length,
      kept,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
