/**
 * POST /api/amana-content/[key]/upload — image upload for Amana Way / Handbook
 *
 * Saves the file to `public/uploads/amana-content/<key>/` and returns the
 * resulting `/uploads/...` URL. The caller stores this URL as an override
 * value for an `<EImg k="...">` wrapper key.
 *
 * 2026-05-15: Amana Way editable content + Educators Handbook embed.
 */

import { NextResponse } from "next/server";
import path from "path";
import { writeFile, mkdir } from "fs/promises";
import { createHash, randomUUID } from "crypto";
import type { Role } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { validateFileContent } from "@/lib/file-validation";

const EDIT_ROLES: Role[] = ["owner", "admin"];

const ALLOWED_KEYS = new Set(["amana-way", "amana-handbook"]);

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

type RouteCtx = { params: Promise<{ key: string }> };

export const POST = withApiAuth(
  async (req, _session, context) => {
    const params = await (context as RouteCtx).params;
    const key = params?.key ?? "";
    if (!ALLOWED_KEYS.has(key)) {
      throw ApiError.notFound(`Unknown amana-content key: ${key}`);
    }

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
        `Unsupported type ${file.type || "(none)"}; allowed: PNG, JPEG, WebP, SVG`,
      );
    }
    if (file.size > MAX_SIZE) {
      throw ApiError.badRequest(
        `File too large (${(file.size / 1024 / 1024).toFixed(2)} MB); max 2 MB`,
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

    const dir = path.join(process.cwd(), "public", "uploads", "amana-content", key);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), buffer);

    const url = `/uploads/amana-content/${key}/${filename}`;
    return NextResponse.json({ url });
  },
  { roles: EDIT_ROLES, rateLimit: { max: 20, windowMs: 60_000 } },
);
