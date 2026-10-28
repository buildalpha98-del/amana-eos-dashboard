import { NextResponse } from "next/server";
import { uploadPrivateFile } from "@/lib/private-storage";
import { validateFileContent } from "@/lib/file-validation";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError } from "@/lib/api-error";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_SIZE = 5 * 1024 * 1024; // 5MB — matches client-side cap for message attachments

/**
 * POST /api/parent/upload/image — Upload a message attachment for a parent.
 * Returns a publicly-accessible URL that can be persisted on
 * Message.attachmentUrls.
 */
export const POST = withParentAuth(async (req, ctx) => {
  if (!ctx.parent.accountId) throw ApiError.unauthorized("Please sign in again.");
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    throw ApiError.badRequest("No file provided");
  }

  if (!IMAGE_TYPES.has(file.type)) {
    throw ApiError.badRequest(
      `File type ${file.type} is not allowed. Accepted: JPEG, PNG, WebP, HEIC.`,
    );
  }

  if (file.size > MAX_SIZE) {
    throw ApiError.badRequest("File size exceeds 5MB limit");
  }

  const bytes = await file.arrayBuffer();
  if (!validateFileContent(bytes, file.type)) {
    throw ApiError.badRequest("File content does not match declared type");
  }

  const { url } = await uploadPrivateFile(Buffer.from(bytes), file.name, file.type, { ownerParentId: ctx.parent.accountId });

  return NextResponse.json({ url });
});
