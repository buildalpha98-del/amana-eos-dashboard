/**
 * POST /api/parent/upload — enrolment document upload for FAMILIES.
 *
 * Separate from /api/upload, which is wrapped in withApiAuth and so only
 * accepts a staff session. A parent uploading their child's birth
 * certificate has a parent-session cookie and would simply get a 401
 * there.
 *
 * Deliberately narrower than the staff endpoint: images and PDFs only. A
 * family has no reason to attach a spreadsheet or a Word macro document to
 * an enrolment, and every accepted type is attack surface.
 */
import { NextResponse } from "next/server";
import path from "path";
import { uploadFile } from "@/lib/storage";
import { validateFileContent } from "@/lib/file-validation";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError } from "@/lib/api-error";

const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  // iPhones default to HEIC — a parent photographing a certificate would
  // otherwise hit a confusing rejection on a perfectly valid image.
  "image/heic",
  "image/heif",
];

/**
 * 4MB — deliberately BELOW the ~4.5MB request-body ceiling Vercel applies
 * to serverless functions.
 *
 * The old 10MB was unreachable: the platform rejects an oversized body
 * before this handler ever runs, replying with plain-text "Request Entity
 * Too Large". A parent saw that surface as
 * `Unexpected token 'R', "Request En"... is not valid JSON`, because the
 * client parsed it as JSON. The client now downscales photos before
 * sending and handles non-JSON replies; this keeps our stated limit
 * honest. Must stay in step with MAX_UPLOAD_MB in
 * src/app/parent/enrol/ui.tsx.
 */
const MAX_SIZE = 4 * 1024 * 1024; // 4MB

export const POST = withParentAuth(async (req) => {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const kind = String(formData.get("type") ?? "document");

  if (!file) throw ApiError.badRequest("No file provided.");

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw ApiError.badRequest(
      "Please upload a PDF or a photo (JPG, PNG or HEIC).",
    );
  }
  if (file.size > MAX_SIZE) {
    throw new ApiError(
      413,
      "That file is larger than 4MB. If it's a photo, try again — we shrink photos automatically. If it's a PDF, please upload a photo of the document instead.",
    );
  }

  // Magic-byte check: a renamed .exe still declares image/png otherwise.
  const bytes = await file.arrayBuffer();
  if (!validateFileContent(bytes, file.type)) {
    throw ApiError.badRequest("That file doesn't look like the type it claims to be.");
  }

  const ext = path.extname(file.name) || "";
  const baseName = path
    .basename(file.name, ext)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .substring(0, 50);
  const uniqueName = `${kind}-${baseName}-${Date.now()}${ext}`;

  const { url } = await uploadFile(Buffer.from(bytes), uniqueName, {
    contentType: file.type,
    folder: "enrolment-documents",
  });

  return NextResponse.json({ filename: file.name, url, type: kind });
});
