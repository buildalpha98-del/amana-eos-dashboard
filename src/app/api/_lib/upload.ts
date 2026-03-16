import path from "path";
import { uploadFile } from "@/lib/storage";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt", ".csv", ".rtf",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ".zip",
]);

/**
 * Magic byte signatures for file type validation.
 * Validates actual file content matches the claimed extension.
 */
const MAGIC_BYTES: { ext: string; bytes: number[] }[] = [
  { ext: ".pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { ext: ".png", bytes: [0x89, 0x50, 0x4e, 0x47] }, // .PNG
  { ext: ".jpg", bytes: [0xff, 0xd8, 0xff] },
  { ext: ".jpeg", bytes: [0xff, 0xd8, 0xff] },
  { ext: ".gif", bytes: [0x47, 0x49, 0x46] }, // GIF
  { ext: ".webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF (WebP container)
  { ext: ".zip", bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK
  { ext: ".xlsx", bytes: [0x50, 0x4b, 0x03, 0x04] }, // OOXML = ZIP
  { ext: ".docx", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { ext: ".pptx", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { ext: ".doc", bytes: [0xd0, 0xcf, 0x11, 0xe0] }, // OLE2
  { ext: ".xls", bytes: [0xd0, 0xcf, 0x11, 0xe0] },
  { ext: ".ppt", bytes: [0xd0, 0xcf, 0x11, 0xe0] },
  { ext: ".rtf", bytes: [0x7b, 0x5c, 0x72, 0x74, 0x66] }, // {\rtf
];

function validateMagicBytes(buffer: Buffer, ext: string): boolean {
  // Text formats don't have reliable magic bytes — skip
  if ([".txt", ".csv", ".svg"].includes(ext)) return true;

  const signatures = MAGIC_BYTES.filter((m) => m.ext === ext);
  if (signatures.length === 0) return true; // No signature defined — allow

  return signatures.some((sig) => {
    if (buffer.length < sig.bytes.length) return false;
    return sig.bytes.every((b, i) => buffer[i] === b);
  });
}

type UploadType = "programs" | "resources" | "attachments";

interface UploadResult {
  fileUrl: string;
  fileName: string;
  fileSize: number;
}

// Extension → MIME type for Vercel Blob contentType
const EXT_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".rtf": "application/rtf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".zip": "application/zip",
};

/**
 * Decode a base64-encoded file and upload it to Vercel Blob storage.
 * Returns the public blob URL.
 */
export async function saveBase64File(
  base64Data: string,
  filename: string,
  type: UploadType
): Promise<UploadResult> {
  const buffer = Buffer.from(base64Data, "base64");

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(
      `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit: ${filename}`
    );
  }

  // Validate file extension
  const ext = path.extname(filename).toLowerCase() || "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `File type "${ext || "unknown"}" is not allowed. Accepted: ${[...ALLOWED_EXTENSIONS].join(", ")}`
    );
  }

  // Validate file content matches claimed extension (magic bytes)
  if (!validateMagicBytes(buffer, ext)) {
    throw new Error(
      `File content does not match extension "${ext}". The file may be corrupted or mislabeled.`
    );
  }

  // Sanitise filename
  const baseName = path
    .basename(filename, ext)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .substring(0, 80);
  const uniqueName = `${baseName}-${Date.now()}${ext}`;

  // Upload to Vercel Blob
  const { url } = await uploadFile(buffer, uniqueName, {
    contentType: EXT_MIME[ext] ?? "application/octet-stream",
    folder: type,
  });

  return {
    fileUrl: url,
    fileName: filename,
    fileSize: buffer.length,
  };
}
