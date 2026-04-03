import { NextResponse } from "next/server";
import path from "path";
import { uploadFile } from "@/lib/storage";
import { validateFileContent } from "@/lib/file-validation";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * POST /api/upload/image — Upload an image with PUBLIC access.
 * Returns a URL suitable for use in ParentPost.mediaUrls.
 */
export const POST = withApiAuth(async (req) => {
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
    throw ApiError.badRequest("File size exceeds 10MB limit");
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
    folder: "parent-posts",
    access: "public",
  });

  return NextResponse.json({ url });
});
