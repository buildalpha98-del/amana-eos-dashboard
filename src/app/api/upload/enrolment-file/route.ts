import { NextResponse } from "next/server";
import path from "path";
import { uploadFile } from "@/lib/storage";
import { validateFileContent } from "@/lib/file-validation";
import { withParentAuth } from "@/lib/parent-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const bodySchema = z.object({
  file: z.string().min(1, "file is required"),
  filename: z.string().min(1, "filename is required"),
  contentType: z.string().optional(),
});

/**
 * 4 MB, matching `/api/parent/upload`.
 *
 * The 10 MB this replaces was unreachable: Vercel caps a serverless
 * request body at roughly 4.5 MB, so a file between the two limits was
 * rejected by the platform before this route ran and the parent saw
 * `Unexpected token 'R', "Request En"... is not valid JSON` instead of
 * a message. A limit you can actually hit produces a real error.
 */
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const EXTENSION_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

/**
 * POST /api/upload/enrolment-file — now requires a parent session.
 *
 * This was public, and had to be: it served the anonymous enrolment
 * form at `/enrol`. That form is gone, and every caller left — the
 * medical, child and parent steps of the wizard — is reached only from
 * `/parent/children/new`, where the parent is signed in.
 *
 * What it was in the meantime: an unauthenticated file-upload endpoint
 * on the public internet, guarded by a rate limiter held in a
 * module-level `Map`. On serverless that map is per-instance and resets
 * on every cold start, so the 20-per-15-minutes cap was closer to
 * decorative than real. `withParentAuth` brings the shared Redis-backed
 * limit (60/min per parent) with it, and the bespoke map is gone.
 */
export const POST = withParentAuth(async (req) => {

  try {
    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { file, filename, contentType } = parsed.data;

    const buffer = Buffer.from(file, "base64");
    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
    }

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `File type "${ext}" not allowed. Accepted: ${[...ALLOWED_EXTENSIONS].join(", ")}` },
        { status: 400 }
      );
    }

    // Validate magic bytes match declared content type
    // Infer MIME from extension when browser doesn't provide contentType
    const declaredMime = contentType || EXTENSION_TO_MIME[ext] || "application/octet-stream";
    if (!validateFileContent(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), declaredMime)) {
      return NextResponse.json(
        { error: "File content does not match declared type" },
        { status: 400 }
      );
    }

    const baseName = path
      .basename(filename, ext)
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .substring(0, 80);
    const uniqueName = `${baseName}-${Date.now()}${ext}`;

    const { url } = await uploadFile(buffer, uniqueName, {
      contentType: contentType || "application/octet-stream",
      folder: "enrolments",
    });

    return NextResponse.json({ fileUrl: url, fileName: filename, fileSize: buffer.length });
  } catch (e) {
    logger.error("Enrolment file upload error", { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
});
