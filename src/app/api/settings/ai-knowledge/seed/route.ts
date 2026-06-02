/**
 * POST /api/settings/ai-knowledge/seed
 *
 * Idempotent seeder for the three starter knowledge entries — Amana
 * Way, Employee Handbook, Proven Process. Skips entries that already
 * exist (matched by title) so re-running is safe.
 *
 * Owner / head_office / admin can run it.
 *
 * 2026-06-02.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { indexTextContent } from "@/lib/document-indexer";
import { KNOWLEDGE_SEEDS } from "@/lib/ai-knowledge-seeds";
import { logger } from "@/lib/logger";

const KNOWLEDGE_FILE_URL = "internal://knowledge";

export const POST = withApiAuth(
  async (_req, session) => {
    const results: Array<{
      title: string;
      status: "created" | "skipped";
      id?: string;
      chunks?: number;
    }> = [];

    for (const seed of KNOWLEDGE_SEEDS) {
      // Idempotency: skip if an entry with this title already exists
      // among knowledge entries (filtered by the internal:// fileUrl
      // sentinel so a normal Document with the same title doesn't
      // block creation).
      const existing = await prisma.document.findFirst({
        where: {
          fileUrl: KNOWLEDGE_FILE_URL,
          title: seed.title,
        },
        select: { id: true },
      });

      if (existing) {
        results.push({
          title: seed.title,
          status: "skipped",
          id: existing.id,
        });
        continue;
      }

      const created = await prisma.document.create({
        data: {
          title: seed.title,
          description: seed.body.slice(0, 280),
          category: "other",
          fileName: `${seed.title.toLowerCase().replace(/\s+/g, "-")}.txt`,
          fileUrl: KNOWLEDGE_FILE_URL,
          fileSize: Buffer.byteLength(seed.body, "utf-8"),
          mimeType: "text/plain",
          uploadedById: session!.user.id,
        },
      });

      await indexTextContent(created.id, seed.body);

      const chunkCount = await prisma.documentChunk.count({
        where: { documentId: created.id },
      });

      results.push({
        title: seed.title,
        status: "created",
        id: created.id,
        chunks: chunkCount,
      });
    }

    logger.info("AI knowledge seeds run", {
      actorId: session!.user.id,
      created: results.filter((r) => r.status === "created").length,
      skipped: results.filter((r) => r.status === "skipped").length,
    });

    return NextResponse.json({ results });
  },
  { roles: ["owner", "head_office", "admin"] },
);
