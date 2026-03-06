import { mkdir, writeFile } from "fs/promises";
import path from "path";

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

/**
 * Decode a base64-encoded file and save it to /public/uploads/{type}/{filename}.
 * Returns the public URL path.
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

  // Ensure directory exists
  const uploadsDir = path.join(process.cwd(), "public", "uploads", type);
  await mkdir(uploadsDir, { recursive: true });

  // Write file
  const filePath = path.join(uploadsDir, uniqueName);
  await writeFile(filePath, buffer);

  return {
    fileUrl: `/uploads/${type}/${uniqueName}`,
    fileName: filename,
    fileSize: buffer.length,
  };
}
