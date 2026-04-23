import { NextResponse } from "next/server";
import path from "path";
import { uploadFile } from "@/lib/storage";
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
export const POST = withParentAuth(async (req) => {
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

  const ext = path.extname(file.name) || ".jpg";
  const baseName = path
    .basename(file.name, ext)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .substring(0, 50);
  const uniqueName = `${baseName}-${Date.now()}${ext}`;

  const buffer = Buffer.from(bytes);
  const { url } = await uploadFile(buffer, uniqueName, {
    contentType: file.type,
    folder: "message-attachments",
    access: "public",
  });

  return NextResponse.json({ url });
});
