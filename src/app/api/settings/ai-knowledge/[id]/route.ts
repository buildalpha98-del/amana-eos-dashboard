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
import { deleteFile } from "@/lib/storage";
import { logger } from "@/lib/logger";

const KNOWLEDGE_FILE_URL = "internal://knowledge";
const MAX_BODY_BYTES = 500_000;

// A knowledge entry is either the text-sentinel `internal://knowledge`
// or a blob URL under `/ai-knowledge/`. Same predicate as the list
// endpoint — keeps the two routes consistent.
function isKnowledgeEntry(fileUrl: string): boolean {
  return fileUrl === KNOWLEDGE_FILE_URL || fileUrl.includes("/ai-knowledge/");
}

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
    if (!doc || !isKnowledgeEntry(doc.fileUrl)) {
      throw ApiError.notFound("Knowledge entry not found");
    }
    // Reconstruct the body from chunks. For text entries this is the
    // ground-truth content (pasted by admin, chunked at save). For
    // file uploads this is the extracted text — same shape, the
    // editing UI just disables the textarea since you can't re-edit
    // a PDF's content from this form.
    const body = doc.chunks
      .map((c) => c.content)
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n");
    return NextResponse.json({
      id: doc.id,
      title: doc.title,
      body,
      kind: doc.fileUrl === KNOWLEDGE_FILE_URL ? "text" : "file",
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
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
    if (!existing || !isKnowledgeEntry(existing.fileUrl)) {
      throw ApiError.notFound("Knowledge entry not found");
    }
    // File uploads can be retitled but their body can't be edited
    // inline — to change the content, delete + re-upload.
    const isFileEntry = existing.fileUrl !== KNOWLEDGE_FILE_URL;

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
      if (isFileEntry) {
        throw ApiError.badRequest(
          "Body of an uploaded file can't be edited inline. Delete and re-upload to change the content.",
        );
      }
      if (Buffer.byteLength(parsed.data.body, "utf-8") > MAX_BODY_BYTES) {
        throw ApiError.badRequest(
          `Body too large (max ${MAX_BODY_BYTES.toLocaleString()} bytes).`,
        );
      }
      data.description = parsed.data.body.slice(0, 280);
      data.fileSize = Buffer.byteLength(parsed.data.body, "utf-8");
    }

    await prisma.document.update({ where: { id }, data });

    // Re-index if the body changed (text entries only — file entries
    // reject body edits above).
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
    if (!existing || !isKnowledgeEntry(existing.fileUrl)) {
      throw ApiError.notFound("Knowledge entry not found");
    }

    // For uploaded files (blob-backed entries), remove the blob too
    // so we don't leak storage. Text entries have a sentinel fileUrl
    // and skip this. deleteFile swallows missing-blob errors so a
    // stale URL doesn't block the row delete.
    if (existing.fileUrl !== KNOWLEDGE_FILE_URL) {
      try {
        await deleteFile(existing.fileUrl);
      } catch (err) {
        logger.warn("AI knowledge file: blob delete failed", {
          id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
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
