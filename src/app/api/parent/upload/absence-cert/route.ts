import { NextResponse } from "next/server";
import path from "path";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError } from "@/lib/api-error";
import { uploadFile } from "@/lib/storage";
import { validateFileContent } from "@/lib/file-validation";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/parent/upload/absence-cert — Upload a medical certificate for a
 * parent-reported absence. Returns a Vercel Blob URL suitable for persisting
 * on the Absence record.
 */
export const POST = withParentAuth(async (req) => {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) throw ApiError.badRequest("No file provided");

  if (!ALLOWED_TYPES.has(file.type)) {
    throw ApiError.badRequest(
      `File type ${file.type} is not allowed. Accepted: PDF, JPEG, PNG, WebP, HEIC.`,
    );
  }

  if (file.size > MAX_SIZE) {
    throw ApiError.badRequest("File size exceeds 10MB limit");
  }

  const bytes = await file.arrayBuffer();
  if (file.type.startsWith("image/") && !validateFileContent(bytes, file.type)) {
    throw ApiError.badRequest("File content does not match declared type");
  }

  const ext = path.extname(file.name) || (file.type === "application/pdf" ? ".pdf" : ".jpg");
  const baseName = path
    .basename(file.name, ext)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .substring(0, 50);
  const uniqueName = `${baseName || "cert"}-${Date.now()}${ext}`;

  const buffer = Buffer.from(bytes);
  const { url } = await uploadFile(buffer, uniqueName, {
    contentType: file.type,
    folder: "parent-absence-certs",
    access: "public",
  });

  return NextResponse.json({ url });
});
