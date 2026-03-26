import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { withApiAuth } from "@/lib/server-auth";
import { validateFileContent } from "@/lib/file-validation";
import { logger } from "@/lib/logger";
import { indexDocument } from "@/lib/document-indexer";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_FILES = 20;

const VALID_CATEGORIES = [
  "program",
  "policy",
  "procedure",
  "template",
  "guide",
  "compliance",
  "financial",
  "marketing",
  "hr",
  "other",
];

export const POST = withApiAuth(async (req, session) => {
const formData = await req.formData();

  // Collect all files from formData
  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (key === "files" && value instanceof File) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES} files allowed per upload` },
      { status: 400 },
    );
  }

  // Parse optional metadata JSON
  const metadataRaw = formData.get("metadata");
  let metadata: {
    category?: string;
    centreId?: string;
    folderId?: string;
    tags?: string[];
  } = {};
  if (metadataRaw && typeof metadataRaw === "string") {
    try {
      metadata = JSON.parse(metadataRaw);
    } catch {
      return NextResponse.json({ error: "Invalid metadata JSON" }, { status: 400 });
    }
  }

  // Validate category if provided
  if (metadata.category && !VALID_CATEGORIES.includes(metadata.category)) {
    return NextResponse.json(
      { error: `Invalid category: ${metadata.category}` },
      { status: 400 },
    );
  }

  // Validate each file
  const validationErrors: string[] = [];
  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      validationErrors.push(`${file.name}: file type ${file.type} is not allowed`);
    }
    if (file.size > MAX_FILE_SIZE) {
      validationErrors.push(`${file.name}: exceeds 10MB limit`);
    }
  }

  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: "File validation failed", details: validationErrors },
      { status: 400 },
    );
  }

  // Validate magic bytes for binary files
  for (const file of files) {
    if (file.type !== "text/csv" && file.type !== "text/plain") {
      const bytes = await file.arrayBuffer();
      if (!validateFileContent(bytes, file.type)) {
        validationErrors.push(`${file.name}: file content does not match declared type`);
      }
    }
  }

  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: "File content validation failed", details: validationErrors },
      { status: 400 },
    );
  }

  // Upload all files to Vercel Blob
  const uploadResults: {
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
  }[] = [];
  const failedFiles: string[] = [];

  for (const file of files) {
    try {
      const ext = path.extname(file.name) || "";
      const baseName = path
        .basename(file.name, ext)
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .substring(0, 50);
      const uniqueName = `${baseName}-${Date.now()}${ext}`;

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const { url } = await uploadFile(buffer, uniqueName, {
        contentType: file.type,
        folder: "uploads",
      });

      uploadResults.push({
        fileName: file.name,
        fileUrl: url,
        fileSize: file.size,
        mimeType: file.type,
      });
    } catch {
      failedFiles.push(file.name);
    }
  }

  if (uploadResults.length === 0) {
    return NextResponse.json(
      { error: "All file uploads failed", details: failedFiles },
      { status: 500 },
    );
  }

  // Create Document records in a transaction
  const created = await prisma.$transaction(
    uploadResults.map((upload) =>
      prisma.document.create({
        data: {
          title: upload.fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
          fileName: upload.fileName,
          fileUrl: upload.fileUrl,
          fileSize: upload.fileSize,
          mimeType: upload.mimeType,
          category: (metadata.category || "other") as any,
          centreId: metadata.centreId || null,
          folderId: metadata.folderId || null,
          tags: metadata.tags || [],
          uploadedById: session!.user.id,
        },
      }),
    ),
  );

  for (const doc of created) {
    indexDocument(doc.id).catch((err) => {
      logger.warn("Auto-index failed", { documentId: doc.id, error: err });
    });
  }

  return NextResponse.json({
    created: created.length,
    failed: failedFiles.length,
    documents: created.map((d) => ({ id: d.id, title: d.title })),
    ...(failedFiles.length > 0 ? { failedFiles } : {}),
  });
}, { roles: ["owner", "head_office", "admin"] });
