import { NextResponse } from "next/server";
import path from "path";
import sharp from "sharp";
import { uploadFile } from "@/lib/storage";
import { validateFileContent } from "@/lib/file-validation";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

const MAX_SIZE = 5 * 1024 * 1024;

function outputFormat(mime: string): "jpeg" | "png" | "webp" {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpeg";
}

function outputExt(fmt: "jpeg" | "png" | "webp"): string {
  if (fmt === "png") return ".png";
  if (fmt === "webp") return ".webp";
  return ".jpg";
}

function outputContentType(fmt: "jpeg" | "png" | "webp"): string {
  if (fmt === "png") return "image/png";
  if (fmt === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * POST /api/upload/image — upload a photo for a ParentPost.
 *
 * Pipeline: MIME allowlist → size cap → magic-byte check (skipped for HEIC,
 * which sharp validates at decode time) → sharp.rotate().<fmt>() to strip
 * EXIF (incl. GPS) and apply orientation → upload to public Vercel Blob.
 * HEIC inputs are transcoded to JPEG because most desktop browsers can't render them.
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
    throw ApiError.badRequest("File size exceeds 5MB limit");
  }

  const bytes = await file.arrayBuffer();

  if (file.type !== "image/heic" && !validateFileContent(bytes, file.type)) {
    throw ApiError.badRequest("File content does not match declared type");
  }

  const fmt = outputFormat(file.type);
  let processed: Buffer;
  try {
    const pipeline = sharp(Buffer.from(bytes)).rotate();
    processed =
      fmt === "png"
        ? await pipeline.png().toBuffer()
        : fmt === "webp"
          ? await pipeline.webp().toBuffer()
          : await pipeline.jpeg({ quality: 85 }).toBuffer();
  } catch {
    throw ApiError.badRequest("Could not decode image");
  }

  const ext = outputExt(fmt);
  const originalExt = path.extname(file.name) || ext;
  const baseName = path
    .basename(file.name, originalExt)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .substring(0, 50);
  const uniqueName = `${baseName}-${Date.now()}${ext}`;

  const { url } = await uploadFile(processed, uniqueName, {
    contentType: outputContentType(fmt),
    folder: "parent-posts",
    access: "public",
  });

  return NextResponse.json({ url });
});
