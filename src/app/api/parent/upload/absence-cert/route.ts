import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError } from "@/lib/api-error";
import { uploadPrivateFile } from "@/lib/private-storage";
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
export const POST = withParentAuth(async (req, ctx) => {
  if (!ctx.parent.accountId) throw ApiError.unauthorized("Please sign in again.");
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

  const { url } = await uploadPrivateFile(Buffer.from(bytes), file.name, file.type, { ownerParentId: ctx.parent.accountId });

  return NextResponse.json({ url });
});
