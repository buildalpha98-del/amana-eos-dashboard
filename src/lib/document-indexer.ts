/**
 * Document indexer — extracts text from uploaded files, chunks for vector
 * search, and provides full-text search over DocumentChunk via tsvector.
 *
 * Core library for the Knowledge Agent feature.
 *
 * @example
 * ```ts
 * import { indexDocument, searchChunks, formatChunksForPrompt } from "@/lib/document-indexer";
 *
 * // Index a newly uploaded document
 * await indexDocument("clx...documentId");
 *
 * // Search across all indexed documents
 * const results = await searchChunks("leave policy");
 * const context = formatChunksForPrompt(results);
 * ```
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────

export interface DocumentChunkData {
  content: string;
  heading: string | null;
  chunkIndex: number;
  tokenCount: number;
}

export interface SearchChunkRow {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  heading: string | null;
  tokenCount: number;
  rank: number;
  documentTitle: string;
  documentCategory: string;
  fileName: string;
}

export interface SearchResult {
  documentId: string;
  documentTitle: string;
  documentCategory: string;
  fileName: string;
  chunks: {
    id: string;
    chunkIndex: number;
    content: string;
    heading: string | null;
    tokenCount: number;
    rank: number;
  }[];
}

// ─── Constants ────────────────────────────────────────────────

const MAX_TOKENS_PER_CHUNK = 500;
const OVERLAP_TOKENS = 50;
const HEADING_REGEX = /^#{1,3}\s+(.+)$/;

const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
]);

// ─── Helpers ──────────────────────────────────────────────────

/** Estimate token count as ceil(characters / 4) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── extractText ──────────────────────────────────────────────

/**
 * Downloads a file and extracts its text content.
 * Supports PDF (via pdf-parse), DOCX (via mammoth), and text-based formats.
 *
 * @throws Error for unsupported MIME types or failed downloads.
 */
export async function extractText(
  fileUrl: string,
  mimeType: string,
): Promise<string> {
  // Text-based types: download and return raw text
  if (TEXT_MIME_TYPES.has(mimeType)) {
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(
        `Failed to download file: ${res.status} ${res.statusText}`,
      );
    }
    return res.text();
  }

  // PDF
  if (mimeType === "application/pdf") {
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(
        `Failed to download file: ${res.status} ${res.statusText}`,
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const pdfModule = await import("pdf-parse");
    // pdf-parse v2 exports PDFParse class; use it to extract text
    const pdf = new pdfModule.PDFParse({ data: new Uint8Array(buffer) });
    const result = await pdf.getText();
    await pdf.destroy();
    return result.text;
  }

  // DOCX
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(
        `Failed to download file: ${res.status} ${res.statusText}`,
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported MIME type for text extraction: ${mimeType}`);
}

// ─── chunkText ────────────────────────────────────────────────

/**
 * Splits text into ~500-token chunks at heading boundaries with 50-token overlap.
 * Returns DocumentChunkData[] with content, heading, chunkIndex, tokenCount.
 */
export function chunkText(text: string): DocumentChunkData[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Split into sections by headings
  const lines = trimmed.split("\n");
  const sections: { heading: string | null; lines: string[] }[] = [];
  let currentSection: { heading: string | null; lines: string[] } = {
    heading: null,
    lines: [],
  };

  for (const line of lines) {
    const match = line.match(HEADING_REGEX);
    if (match) {
      // Save current section if it has content
      if (currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { heading: match[1].trim(), lines: [line] };
    } else {
      currentSection.lines.push(line);
    }
  }
  // Push last section
  if (currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  // Now split sections that exceed MAX_TOKENS_PER_CHUNK
  const chunks: DocumentChunkData[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const sectionText = section.lines.join("\n").trim();
    if (!sectionText) continue;

    const sectionTokens = estimateTokens(sectionText);

    if (sectionTokens <= MAX_TOKENS_PER_CHUNK) {
      chunks.push({
        content: sectionText,
        heading: section.heading,
        chunkIndex: chunkIndex++,
        tokenCount: sectionTokens,
      });
    } else {
      // Split long section into sub-chunks by words
      const words = sectionText.split(/\s+/);
      let start = 0;

      while (start < words.length) {
        // Determine how many words fit in ~MAX_TOKENS_PER_CHUNK
        let end = start;
        let currentText = "";

        while (end < words.length) {
          const candidate =
            end === start ? words[end] : currentText + " " + words[end];
          if (
            estimateTokens(candidate) > MAX_TOKENS_PER_CHUNK &&
            end > start
          ) {
            break;
          }
          currentText = candidate;
          end++;
        }

        const chunkContent = currentText;
        chunks.push({
          content: chunkContent,
          heading: section.heading,
          chunkIndex: chunkIndex++,
          tokenCount: estimateTokens(chunkContent),
        });

        // Overlap: move start back by OVERLAP_TOKENS worth of words
        const overlapChars = OVERLAP_TOKENS * 4; // approximate chars
        let overlapWords = 0;
        let overlapLen = 0;
        for (let i = end - 1; i >= start; i--) {
          overlapLen += words[i].length + 1;
          overlapWords++;
          if (overlapLen >= overlapChars) break;
        }

        start = end - overlapWords;
        if (start <= (chunks.length > 1 ? end - words.length : 0)) {
          // Safety: always advance
          start = end;
        }
        // If we didn't advance at all, force it
        if (start === end - overlapWords && overlapWords >= end - start) {
          start = end;
        }
      }
    }
  }

  return chunks;
}

// ─── indexDocument ─────────────────────────────────────────────

/**
 * Full pipeline: fetch document from DB, download file, extract text,
 * chunk it, store chunks in DocumentChunk table via transaction,
 * update tsvector via raw SQL, and set indexed=true.
 * On error, sets indexError on the document.
 */
export async function indexDocument(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      fileUrl: true,
      mimeType: true,
      title: true,
    },
  });

  if (!doc) {
    logger.error("indexDocument: document not found", { documentId });
    return;
  }

  if (!doc.mimeType) {
    await prisma.document.update({
      where: { id: documentId },
      data: { indexError: "No MIME type set on document" },
    });
    return;
  }

  try {
    logger.info("Indexing document", {
      documentId,
      title: doc.title,
      mimeType: doc.mimeType,
    });

    // 1. Extract text
    const text = await extractText(doc.fileUrl, doc.mimeType);

    // 2. Chunk text
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          indexed: true,
          indexedAt: new Date(),
          indexError: "No text content extracted",
        },
      });
      return;
    }

    // 3. Store chunks in transaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.$transaction(async (tx: any) => {
      // Delete old chunks first
      await tx.documentChunk.deleteMany({ where: { documentId } });

      // Insert new chunks
      await tx.documentChunk.createMany({
        data: chunks.map((chunk) => ({
          documentId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          heading: chunk.heading,
          tokenCount: chunk.tokenCount,
        })),
      });

      // Update tsvector for each chunk via raw SQL
      await tx.$queryRawUnsafe(`
        UPDATE "DocumentChunk"
        SET "searchVector" = to_tsvector('english', content)
        WHERE "documentId" = $1
      `, documentId);

      // Mark document as indexed
      await tx.document.update({
        where: { id: documentId },
        data: {
          indexed: true,
          indexedAt: new Date(),
          indexError: null,
        },
      });
    });

    logger.info("Document indexed successfully", {
      documentId,
      chunkCount: chunks.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Failed to index document", { documentId, err });

    await prisma.document.update({
      where: { id: documentId },
      data: { indexError: message },
    });
  }
}

// ─── searchChunks ─────────────────────────────────────────────

/**
 * Full-text search across indexed DocumentChunks using PostgreSQL tsvector.
 * Returns results grouped by document, ranked by ts_rank.
 */
export async function searchChunks(
  query: string,
  limit: number = 8,
): Promise<SearchResult[]> {
  const rows = await prisma.$queryRawUnsafe<SearchChunkRow[]>(
    `
    SELECT
      dc.id,
      dc."documentId",
      dc."chunkIndex",
      dc.content,
      dc.heading,
      dc."tokenCount",
      ts_rank(dc."searchVector", plainto_tsquery('english', $1)) AS rank,
      d.title AS "documentTitle",
      d.category AS "documentCategory",
      d."fileName"
    FROM "DocumentChunk" dc
    JOIN "Document" d ON d.id = dc."documentId"
    WHERE dc."searchVector" @@ plainto_tsquery('english', $1)
      AND d.deleted = false
    ORDER BY rank DESC
    LIMIT $2
    `,
    query,
    limit,
  );

  if (rows.length === 0) return [];

  // Group by document
  const grouped = new Map<string, SearchResult>();

  for (const row of rows) {
    let group = grouped.get(row.documentId);
    if (!group) {
      group = {
        documentId: row.documentId,
        documentTitle: row.documentTitle,
        documentCategory: row.documentCategory,
        fileName: row.fileName,
        chunks: [],
      };
      grouped.set(row.documentId, group);
    }
    group.chunks.push({
      id: row.id,
      chunkIndex: row.chunkIndex,
      content: row.content,
      heading: row.heading,
      tokenCount: row.tokenCount,
      rank: row.rank,
    });
  }

  return Array.from(grouped.values());
}

// ─── formatChunksForPrompt ────────────────────────────────────

/**
 * Formats search results as text suitable for Claude's context window.
 * Each document gets a header, and each chunk gets a sub-header.
 */
export function formatChunksForPrompt(results: SearchResult[]): string {
  if (results.length === 0) return "";

  const parts: string[] = [];

  for (const result of results) {
    parts.push(
      `--- ${result.documentTitle} (${result.documentCategory}) ---`,
    );
    parts.push(`Source: ${result.fileName}`);
    parts.push("");

    for (const chunk of result.chunks) {
      if (chunk.heading) {
        parts.push(`### ${chunk.heading}`);
      }
      parts.push(chunk.content);
      parts.push("");
    }
  }

  return parts.join("\n").trim();
}
