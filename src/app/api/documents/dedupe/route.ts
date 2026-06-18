/**
 * POST /api/documents/dedupe
 *
 * Collapse duplicate Document rows by filename, keeping the newest.
 * Twin of the AI knowledge dedupe endpoint but for the Documents
 * library at large — same pattern, same idempotency guarantees.
 *
 * Strategy: group by lower-case fileName/title, keep the row with
 * the most recent createdAt, delete the rest (and their chunks via
 * the FK).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

export const POST = withApiAuth(
  async () => {
    const docs = await prisma.document.findMany({
      where: { deleted: false },
      select: {
        id: true,
        title: true,
        fileName: true,
        createdAt: true,
        indexed: true,
        indexedAt: true,
      },
    });

    const groups = new Map<string, typeof docs>();
    for (const d of docs) {
      const key = (d.fileName ?? d.title).toLowerCase();
      const list = groups.get(key) ?? [];
      list.push(d);
      groups.set(key, list);
    }

    const toDelete: string[] = [];
    const kept: { id: string; fileName: string; copiesRemoved: number }[] = [];

    for (const [key, list] of groups) {
      if (list.length < 2) continue;
      // Prefer indexed > most recent indexedAt > most recent createdAt
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
      logger.info("Document dedupe: collapsing group", {
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
