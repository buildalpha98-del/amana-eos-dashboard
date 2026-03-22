/**
 * Validates file content by checking magic bytes (file signatures).
 * Returns the detected MIME type or null if unrecognized.
 */
export function detectFileType(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer);

  // PDF: %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }

  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // GIF: GIF87a or GIF89a
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }

  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  // DOCX/XLSX/PPTX (ZIP-based Office formats): PK header
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return "application/zip"; // Could be docx, xlsx, pptx — all ZIP-based
  }

  // SVG: starts with < (XML-based)
  if (bytes[0] === 0x3c) {
    const text = new TextDecoder().decode(bytes.slice(0, 200));
    if (text.includes("<svg") || text.includes("<?xml")) {
      return "image/svg+xml";
    }
  }

  return null; // Unknown
}

/**
 * Map of MIME types that are zip-based Office formats.
 * When magic bytes detect "application/zip", check if the declared MIME matches.
 */
const ZIP_BASED_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
]);

/**
 * Validates that a file's actual content matches its declared MIME type.
 * Returns true if valid, false if the content doesn't match.
 */
export function validateFileContent(buffer: ArrayBuffer, declaredMime: string): boolean {
  const detected = detectFileType(buffer);

  if (!detected) return false; // Unknown format — reject

  // Direct match
  if (detected === declaredMime) return true;

  // ZIP-based Office formats
  if (detected === "application/zip" && ZIP_BASED_MIMES.has(declaredMime)) return true;

  return false;
}
