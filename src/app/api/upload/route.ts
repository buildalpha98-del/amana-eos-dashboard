import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { uploadFile } from "@/lib/storage";
import { validateFileContent } from "@/lib/file-validation";
import { withApiAuth } from "@/lib/server-auth";
import {
  SERVERLESS_BODY_LIMIT,
  UPLOAD_ALLOWED_MIMES,
} from "@/lib/upload-strategy";

// Files above the serverless body cap never reach this handler — Vercel
// rejects them at the edge with a bare 413. The client routes those to
// /api/upload/blob-token instead, so this route only ever sees small files.
const MAX_SIZE = SERVERLESS_BODY_LIMIT;

export const POST = withApiAuth(async (req, session) => {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!(UPLOAD_ALLOWED_MIMES as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      { error: `File type ${file.type} is not allowed` },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      {
        error:
          "File is too large for this route — the client should have routed it to direct upload.",
      },
      { status: 400 }
    );
  }

  // Read file content and validate magic bytes
  const bytes = await file.arrayBuffer();
  if (!validateFileContent(bytes, file.type)) {
    return NextResponse.json(
      { error: "File content does not match declared type" },
      { status: 400 }
    );
  }

  // Generate unique filename
  const ext = path.extname(file.name) || "";
  const baseName = path
    .basename(file.name, ext)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .substring(0, 50);
  const uniqueName = `${baseName}-${Date.now()}${ext}`;

  // Upload to Vercel Blob
  const buffer = Buffer.from(bytes);
  const { url } = await uploadFile(buffer, uniqueName, {
    contentType: file.type,
    folder: "uploads",
  });

  return NextResponse.json({
    fileName: file.name,
    fileUrl: url,
    fileSize: file.size,
    mimeType: file.type,
  });
});
