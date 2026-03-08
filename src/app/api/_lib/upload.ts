import path from "path";
import { uploadFile } from "@/lib/storage";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt", ".csv", ".rtf",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ".zip",
]);

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
