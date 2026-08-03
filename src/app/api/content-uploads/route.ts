/**
 * POST /api/content-uploads — image upload for the Amana Way / Educators
 * Handbook editable-content layer.
 *
 * Accepts a single `file` field in multipart/form-data, validates the MIME
 * + magic bytes, writes the file to
 *   public/uploads/content/<sha256-prefix>-<uuid>.<ext>
 * and returns `{ url: "/uploads/content/..." }`. Caller stores that URL
 * string as a content-override value via the panel's content API.
 *
 * Owner/admin only. Generic across panels — the upload route has no
 * concept of which handbook it serves, which keeps the surface tiny
 * and avoids one route per panel.
 *
 * 2026-05-16.
 */

import { NextResponse } from "next/server";
import path from "path";
import { writeFile, mkdir } from "fs/promises";
import { createHash, randomUUID } from "crypto";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { validateFileContent } from "@/lib/file-validation";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  // 2026-08-04: service maps. Centres are as likely to have the school's
  // site plan as a PDF as a photo of a printed one.
  "application/pdf",
]);

/**
 * 2 MB for images, 8 MB for PDFs — a scanned site plan is routinely
 * larger than a photo, and bouncing one with "too big" and no way to
 * shrink it is how the field ends up empty.
 */
const MAX_SIZE = 2 * 1024 * 1024;
const MAX_SIZE_PDF = 8 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
};

export const POST = withApiAuth(
  async (req) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw ApiError.badRequest(
        "Expected multipart/form-data with a 'file' field",
      );
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw ApiError.badRequest("No file provided");
    }
    if (!ALLOWED_MIME.has(file.type)) {
      throw ApiError.badRequest(
        `Unsupported type ${file.type || "(none)"}; allowed: PNG, JPEG, WebP, SVG, PDF`,
      );
    }
    const limit = file.type === "application/pdf" ? MAX_SIZE_PDF : MAX_SIZE;
    if (file.size > limit) {
      throw ApiError.badRequest(
        `File too large (${(file.size / 1024 / 1024).toFixed(2)} MB); max ${limit / 1024 / 1024} MB`,
      );
    }

    const bytes = await file.arrayBuffer();
    if (!validateFileContent(bytes, file.type)) {
      throw ApiError.badRequest("File content does not match declared type");
    }

    const buffer = Buffer.from(bytes);
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
    const ext = EXT_BY_MIME[file.type] ?? "";
    const filename = `${hash}-${randomUUID().slice(0, 8)}${ext}`;

    const dir = path.join(process.cwd(), "public", "uploads", "content");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), buffer);

    return NextResponse.json({ url: `/uploads/content/${filename}` });
  },
  {
    roles: ["owner", "admin"],
    rateLimit: { max: 20, windowMs: 60_000 },
  },
);
