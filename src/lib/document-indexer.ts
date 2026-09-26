/**
 * Text extraction (PDF/DOCX/text/ZIP) + heading-aware chunking. Storage and
 * search live in src/lib/knowledge/ (2026-09-27) — this module never
 * touches the database.
 */

// ─── Types ────────────────────────────────────────────────────

export interface DocumentChunkData {
  content: string;
  heading: string | null;
  chunkIndex: number;
  tokenCount: number;
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
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to download file: ${res.status} ${res.statusText}`,
    );
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return extractTextFromBuffer(buffer, mimeType);
}

/**
 * Extract text from an in-memory buffer. Split out so ZIP archives can
 * extract each contained file without a round-trip to storage; also used by
 * contract term extraction, which reads an uploaded file before deciding
 * whether it is worth storing.
 *
 * Supported: PDF (unpdf), DOCX (mammoth), text (utf-8), ZIP
 * (recurses through supported entries, prefixes each with a
 * ## <filename> heading so chunk boundaries survive).
 *
 * `filename` is only used to skip likely-binary entries inside a
 * ZIP (images, spreadsheets, etc.) — the caller ignores it for
 * top-level files where mimeType is authoritative.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  filename?: string,
): Promise<string> {
  // Text-based types
  if (TEXT_MIME_TYPES.has(mimeType)) {
    return buffer.toString("utf-8");
  }

  // PDF
  if (mimeType === "application/pdf") {
    // 2026-06-17: switched to unpdf — purpose-built for serverless
    // Node. No worker file (the issue that took down pdf-parse v2)
    // and no debug-PDF require at module init (the issue that took
    // down pdf-parse v1). Maintained, types included.
    const { extractText: extractPdfText, getDocumentProxy } = await import(
      "unpdf"
    );
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : text;
  }

  // DOCX
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // ZIP — 2026-07-08. Unpack, extract each supported entry, and
  // concatenate the results with per-file H2 headings so chunking
  // preserves file boundaries. Unknown / binary entries are skipped
  // (with a debug log so we can see what got dropped).
  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-zip-compressed"
  ) {
    const JSZip = (await import("jszip")).default;
    const archive = await JSZip.loadAsync(buffer);
    const parts: string[] = [];
    // Sort entries by path for deterministic chunk output.
    const entries = Object.values(archive.files)
      .filter((f) => !f.dir)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      // macOS __MACOSX metadata + hidden dotfiles: skip. They're
      // never document content and pollute the extracted text.
      if (
        entry.name.startsWith("__MACOSX/") ||
        entry.name.split("/").pop()?.startsWith(".")
      ) {
        continue;
      }
      const inferred = inferMimeFromFilename(entry.name);
      if (!inferred) continue; // skip unknown extensions silently
      try {
        const nested = await entry.async("nodebuffer");
        const nestedText = await extractTextFromBuffer(
          nested,
          inferred,
          entry.name,
        );
        if (nestedText.trim()) {
          parts.push(`## ${entry.name}\n\n${nestedText.trim()}`);
        }
      } catch (err) {
        // One bad entry shouldn't kill the whole archive.
        parts.push(
          `## ${entry.name}\n\n_[extraction failed: ${
            err instanceof Error ? err.message : "unknown error"
          }]_`,
        );
      }
    }
    if (parts.length === 0) {
      throw new Error(
        "ZIP archive contained no supported documents (accepted: PDF, DOCX, TXT, MD, CSV, HTML).",
      );
    }
    return parts.join("\n\n");
  }

  throw new Error(
    `Unsupported MIME type for text extraction: ${mimeType}${
      filename ? ` (from ${filename})` : ""
    }`,
  );
}

/**
 * Best-effort MIME inference from a filename extension. Used only when
 * iterating ZIP archive entries where the archive itself carries no
 * per-entry MIME. Returns null for anything we can't index.
 */
function inferMimeFromFilename(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  return null;
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
