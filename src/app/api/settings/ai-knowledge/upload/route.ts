/**
 * POST /api/settings/ai-knowledge/upload
 *
 * Multipart upload endpoint for AI knowledge files. Accepts PDF, DOCX,
 * DOC, TXT, and Markdown. The uploaded file is:
 *   1. Stored in Vercel Blob under the `ai-knowledge/` folder
 *   2. Recorded as a Document row (fileUrl = blob URL, distinguishes
 *      uploaded files from text-only knowledge entries which use the
 *      `internal://knowledge` sentinel)
 *   3. Text-extracted + chunked + indexed via the existing
 *      indexDocument() pipeline so the bot's search_knowledge_base
 *      tool can find it
 *
 * Owner / head_office / admin can upload.
 *
 * 2026-06-02.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { uploadFile } from "@/lib/storage";
import { indexDocument } from "@/lib/document-indexer";
import { logger } from "@/lib/logger";

// File-type allowlist + size cap. PDF/DOCX cover the standard handbook
// formats; TXT/MD for raw notes. Anything outside this list is rejected
// — the bot can't index images, spreadsheets, etc. as-is, and we don't
// want admins uploading 50MB design files into the knowledge base.
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "doc", "txt", "md"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const POST = withApiAuth(
  async (req, session) => {
    const formData = await req.formData().catch(() => null);
    if (!formData) {
      throw ApiError.badRequest("Expected multipart/form-data");
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw ApiError.badRequest("No file uploaded");
    }

    // Title fallback comes from the filename (minus extension) if the
    // form didn't send a custom title. The chunker doesn't care about
    // title — it's just for the admin UI list.
    const customTitle = String(formData.get("title") ?? "").trim();
    const fallbackTitle = file.name.replace(/\.[^.]+$/, "");
    const title = customTitle || fallbackTitle;

    if (!title) {
      throw ApiError.badRequest("Title is required");
    }

    if (file.size > MAX_FILE_SIZE) {
      throw ApiError.badRequest(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max ${MAX_FILE_SIZE / 1024 / 1024} MB).`,
      );
    }

    // Validate by both MIME type AND extension — clients sometimes lie
    // about MIME, and extension is what the text extractor switches on.
    const extension = (file.name.split(".").pop() ?? "").toLowerCase();
    if (
      !ALLOWED_MIME_TYPES.has(file.type) &&
      !ALLOWED_EXTENSIONS.has(extension)
    ) {
      throw ApiError.badRequest(
        `Unsupported file type. Accepted: ${[...ALLOWED_EXTENSIONS].join(", ")}.`,
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to blob storage under the ai-knowledge/ folder so we can
    // distinguish AI knowledge files from other Document uploads when
    // listing.
    const { url } = await uploadFile(buffer, file.name, {
      contentType: file.type || "application/octet-stream",
      folder: "ai-knowledge",
    });

    // Create the Document row pointing at the uploaded blob.
    const created = await prisma.document.create({
      data: {
        title,
        description: null, // populated post-extraction below
        category: "other",
        fileName: file.name,
        fileUrl: url,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        uploadedById: session!.user.id,
      },
    });

    // Run the existing extraction + chunking pipeline. indexDocument
    // downloads from fileUrl, switches on mimeType to call the right
    // extractor (pdf-parse / mammoth / plain), chunks, and writes
    // DocumentChunk rows with the tsvector populated.
    await indexDocument(created.id);

    // Fill the description from the first chunk so the list card has
    // something to preview. Pulled post-index because the extractor
    // is what produced the text.
    const firstChunk = await prisma.documentChunk.findFirst({
      where: { documentId: created.id },
      orderBy: { chunkIndex: "asc" },
      select: { content: true },
    });
    if (firstChunk) {
      await prisma.document.update({
        where: { id: created.id },
        data: { description: firstChunk.content.slice(0, 280) },
      });
    }

    logger.info("AI knowledge file uploaded", {
      id: created.id,
      title,
      fileSize: file.size,
      mimeType: file.type,
      actorId: session!.user.id,
    });

    return NextResponse.json(
      {
        id: created.id,
        title,
        fileName: file.name,
        url,
      },
      { status: 201 },
    );
  },
  { roles: ["owner", "head_office", "admin"] },
);

// Bump the API-route body size limit so 10MB PDFs land cleanly.
export const maxDuration = 60;
