import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { streamStoredFile } from "@/lib/blob-proxy";
import { prisma } from "@/lib/prisma";
import { documentVisibilityWhere } from "@/lib/document-visibility";
// Mapping of file extensions to MIME types
const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const requestedFile = searchParams.get("file");
  const documentId = searchParams.get("id");

  if (!documentId && !requestedFile) {
    return NextResponse.json(
      { error: "Missing document identifier" },
      { status: 400 }
    );
  }

  // Legacy file links must resolve to a visible record too. Never let a
  // supplied URL become an arbitrary same-origin proxy or expose hidden HR files.
  const document = await prisma.document.findFirst({
    where: {
      deleted: false,
      AND: [
        documentId
          ? { id: documentId }
          : { fileUrl: requestedFile!.startsWith("https://") || requestedFile!.startsWith("/uploads/")
              ? requestedFile! : `/uploads/${requestedFile}` },
        documentVisibilityWhere(session.user),
      ],
    },
    select: { fileUrl: true, fileName: true },
  });
  if (!document) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const file = document.fileUrl;
  if (file.startsWith("https://")) {
    return streamStoredFile(file, {
      fileName: document.fileName,
      download: searchParams.get("download") === "1",
    });
  }

  // Sanitize: prevent directory traversal attacks
  const localFile = file.startsWith("/uploads/") ? file.slice("/uploads/".length) : file;
  const sanitized = path.basename(localFile);
  if (sanitized !== localFile || localFile.includes("..") || localFile.includes("/")) {
    return NextResponse.json(
      { error: "Invalid file name" },
      { status: 400 }
    );
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  const filePath = path.join(uploadsDir, sanitized);

  // Verify the resolved path is still within the uploads directory
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(uploadsDir))) {
    return NextResponse.json(
      { error: "Invalid file path" },
      { status: 400 }
    );
  }

  try {
    // Check if file exists
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    // Read file
    const buffer = await readFile(resolved);

    // Determine MIME type from extension
    const ext = path.extname(sanitized).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    // Determine if this should be displayed inline (images, PDFs) or downloaded
    const inlineTypes = [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "application/pdf",
      "text/plain",
      "text/csv",
    ];
    const disposition = inlineTypes.includes(contentType) && searchParams.get("download") !== "1"
      ? `inline; filename="${sanitized}"`
      : `attachment; filename="${sanitized}"`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Content-Length": fileStat.size.toString(),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(contentType !== "application/pdf" ? { "Content-Security-Policy": "sandbox; default-src 'none'" } : {}),
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }
    logger.error("Download error", { err });
    return NextResponse.json(
      { error: "Failed to read file" },
      { status: 500 }
    );
  }
});
