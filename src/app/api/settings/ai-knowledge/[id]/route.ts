/**
 * GET    /api/settings/ai-knowledge/[id] — single entry with full body
 * PATCH  /api/settings/ai-knowledge/[id] — update title / body, re-index
 * DELETE /api/settings/ai-knowledge/[id] — delete entry + its chunks
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { indexTextContent } from "@/lib/document-indexer";
import { logger } from "@/lib/logger";

const KNOWLEDGE_FILE_URL = "internal://knowledge";
const MAX_BODY_BYTES = 500_000;

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const doc = await prisma.document.findUnique({
      where: { id },
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" },
          select: { content: true, chunkIndex: true },
        },
      },
    });
    if (!doc || doc.fileUrl !== KNOWLEDGE_FILE_URL) {
      throw ApiError.notFound("Knowledge entry not found");
    }
    // Reconstruct the body from chunks. Each chunk includes its
    // content with overlap, so naive concat would duplicate text;
    // instead we use the first chunk + subsequent chunks' content
    // from their non-overlap region. For v1 we just send the chunks
    // as the body (closest to "ground truth" of what's indexed) —
    // the editing UI puts them back into a single textarea and
    // the next save re-chunks fresh.
    const body = doc.chunks
      .map((c) => c.content)
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n");
    return NextResponse.json({
      id: doc.id,
      title: doc.title,
      body,
      indexed: doc.indexed,
      indexedAt: doc.indexedAt,
      indexError: doc.indexError,
      chunkCount: doc.chunks.length,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const PATCH = withApiAuth(
  async (req, _session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const existing = await prisma.document.findUnique({
      where: { id },
      select: { id: true, fileUrl: true },
    });
    if (!existing || existing.fileUrl !== KNOWLEDGE_FILE_URL) {
      throw ApiError.notFound("Knowledge entry not found");
    }

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid");
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) {
      data.title = parsed.data.title.trim();
      data.fileName = `${parsed.data.title.trim().toLowerCase().replace(/\s+/g, "-")}.txt`;
    }
    if (parsed.data.body !== undefined) {
      if (Buffer.byteLength(parsed.data.body, "utf-8") > MAX_BODY_BYTES) {
        throw ApiError.badRequest(
          `Body too large (max ${MAX_BODY_BYTES.toLocaleString()} bytes).`,
        );
      }
      data.description = parsed.data.body.slice(0, 280);
      data.fileSize = Buffer.byteLength(parsed.data.body, "utf-8");
    }

    await prisma.document.update({ where: { id }, data });

    // Re-index if the body changed.
    if (parsed.data.body !== undefined) {
      await indexTextContent(id, parsed.data.body);
    }

    logger.info("AI knowledge entry updated", { id });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const existing = await prisma.document.findUnique({
      where: { id },
      select: { id: true, fileUrl: true, title: true },
    });
    if (!existing || existing.fileUrl !== KNOWLEDGE_FILE_URL) {
      throw ApiError.notFound("Knowledge entry not found");
    }

    // Cascade on Document → DocumentChunk via FK. Plus the row itself.
    await prisma.documentChunk.deleteMany({ where: { documentId: id } });
    await prisma.document.delete({ where: { id } });

    logger.warn("AI knowledge entry deleted", {
      id,
      title: existing.title,
      actorId: session!.user.id,
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin"] },
);
