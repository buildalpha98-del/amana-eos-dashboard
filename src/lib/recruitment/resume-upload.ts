/**
 * Résumé intake shared by both public application paths.
 *
 * 2026-09-15: extracted when the general "register your interest" form was
 * added, so the per-vacancy apply route and the pool registration route can't
 * drift on what they accept. The validation here is the only thing standing
 * between a public, unauthenticated form and our storage, so it stays strict:
 * extension allow-list, size ceiling, and a magic-byte check that the bytes
 * actually match the declared type.
 */
import path from "path";
import { ApiError } from "@/lib/api-error";
import { uploadFile } from "@/lib/storage";
import { validateFileContent } from "@/lib/file-validation";

export const MAX_RESUME_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx"]);
const EXTENSION_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export interface ResumeUploadInput {
  /** base64, without a `data:` prefix. */
  resumeFile?: string | null;
  resumeFilename?: string | null;
  resumeContentType?: string | null;
}

/**
 * Store an uploaded résumé and return its URL, or null when none was sent.
 *
 * @throws ApiError.badRequest on a disallowed extension, an empty or oversized
 *         file, or bytes that contradict the declared type.
 */
export async function storeResume(
  input: ResumeUploadInput,
): Promise<string | null> {
  if (!input.resumeFile) return null;

  const filename = input.resumeFilename ?? "resume";
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw ApiError.badRequest(
      `Resume must be a PDF or Word (.docx) file (got "${ext || "unknown"}").`,
    );
  }

  const buffer = Buffer.from(input.resumeFile, "base64");
  if (buffer.length === 0) {
    throw ApiError.badRequest("Resume file is empty or malformed.");
  }
  if (buffer.length > MAX_RESUME_SIZE) {
    throw ApiError.badRequest("Resume exceeds the 10MB limit.");
  }

  const declaredMime =
    input.resumeContentType || EXTENSION_TO_MIME[ext] || "application/octet-stream";
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  if (!validateFileContent(arrayBuffer, declaredMime)) {
    throw ApiError.badRequest("Resume content does not match its file type.");
  }

  const baseName = path
    .basename(filename, ext)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .substring(0, 80);
  const uniqueName = `${baseName || "resume"}-${Date.now()}${ext}`;
  const { url } = await uploadFile(buffer, uniqueName, {
    contentType: declaredMime,
    folder: "resumes",
  });
  return url;
}

/** Zod-friendly shape for the résumé fields on a public form. */
export const resumeFieldsShape = {
  resumeFile: "base64 string, optional",
  resumeFilename: "original filename, optional",
  resumeContentType: "declared mime, optional",
} as const;
