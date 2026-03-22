import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { uploadFile } from "@/lib/storage";
import { validateFileContent } from "@/lib/file-validation";
import { withApiAuth } from "@/lib/server-auth";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export const POST = withApiAuth(async (req, session) => {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `File type ${file.type} is not allowed` },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File exceeds 10MB limit" },
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
