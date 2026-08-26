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

  // TIFF: II*\0 (little-endian) or MM\0* (big-endian)
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
  ) {
    return "image/tiff";
  }

  // BMP: "BM", plus the four reserved bytes at offset 6 that every real
  // bitmap zeroes. Without that check a text file starting "BM" — perfectly
  // possible in a CSV — sniffs as an image and is then rejected as text.
  if (
    bytes[0] === 0x42 &&
    bytes[1] === 0x4d &&
    bytes.length >= 10 &&
    bytes[6] === 0x00 &&
    bytes[7] === 0x00 &&
    bytes[8] === 0x00 &&
    bytes[9] === 0x00
  ) {
    return "image/bmp";
  }

  // Legacy Office (.doc/.xls/.ppt) share one OLE2 compound-file header.
  // These MIME types were on the upload allow-list with no signature here, so
  // every such upload failed "content does not match declared type".
  if (
    bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1
  ) {
    return "application/x-ole-storage";
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

  // HEIC/HEIF: ISO Base Media File Format.
  //   bytes 4-7  = "ftyp"
  //   bytes 8-11 = brand ("heic", "heix", "mif1", "msf1", "heim", "heis")
  // iPhones default to HEIC for photos; staff uploading from a phone can
  // bypass <input accept=...> filters and hit the server with raw HEIC,
  // surfacing as a generic upload failure pre-fix.
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 && // f
    bytes[5] === 0x74 && // t
    bytes[6] === 0x79 && // y
    bytes[7] === 0x70 // p
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (HEIC_BRANDS.has(brand)) return "image/heic";
  }

  // Plain text / CSV carry no magic bytes, so they are inferred last — only
  // once every binary signature above has been ruled out. Same reason as the
  // OLE2 case: both were allow-listed for upload with nothing to detect them.
  if (looksLikeText(bytes)) return "text/plain";

  return null; // Unknown
}

/**
 * Heuristic: a run of bytes is text if it holds no NUL and no stray control
 * characters. Bytes >= 0x80 are allowed through as UTF-8 continuation bytes.
 */
function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const sample = bytes.subarray(0, 512);
  for (const b of sample) {
    if (b === 0x00) return false;
    const printable = b >= 0x20 || b === 0x09 || b === 0x0a || b === 0x0d;
    if (!printable) return false;
  }
  return true;
}

const HEIC_BRANDS = new Set([
  "heic", // single image
  "heix", // extended
  "mif1", // multi-image (Apple, Google)
  "msf1", // multi-image sequence
  "heim", // multi-image
  "heis", // image sequence
]);

/**
 * Map of MIME types that are zip-based Office formats.
 * When magic bytes detect "application/zip", check if the declared MIME matches.
 */
const OLE2_BASED_MIMES = new Set([
  "application/msword", // .doc
  "application/vnd.ms-excel", // .xls
  "application/vnd.ms-powerpoint", // .ppt
]);

/** MIME types that are plain text on the wire. */
const TEXT_BASED_MIMES = new Set(["text/plain", "text/csv"]);

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

  // HEIC/HEIF: Apple uses both MIME types for the same container format.
  if (detected === "image/heic" && declaredMime === "image/heif") return true;

  // Legacy Office formats all sit in one OLE2 container.
  if (detected === "application/x-ole-storage" && OLE2_BASED_MIMES.has(declaredMime))
    return true;

  // CSV is text; so is anything else we accept as text.
  if (detected === "text/plain" && TEXT_BASED_MIMES.has(declaredMime)) return true;

  return false;
}
