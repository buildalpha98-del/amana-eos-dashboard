import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { withApiAuth } from "@/lib/server-auth";
import { validateFileContent } from "@/lib/file-validation";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// GET /api/activity-templates/[id]/files
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const files = await prisma.activityTemplateFile.findMany({
    where: { templateId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(files);
});

// POST /api/activity-templates/[id]/files — upload file
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  // Verify template exists
  const template = await prisma.activityTemplate.findFirst({
    where: { id, deleted: false },
    select: { id: true },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

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
    return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();

  // Validate file content matches declared MIME type (skip for text/csv and text/plain)
  if (file.type !== "text/csv" && file.type !== "text/plain") {
    if (!validateFileContent(bytes, file.type)) {
      return NextResponse.json(
        { error: "File content does not match declared type" },
        { status: 400 },
      );
    }
  }

  const ext = path.extname(file.name) || "";
  const baseName = path
    .basename(file.name, ext)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .substring(0, 50);
  const uniqueName = `${baseName}-${Date.now()}${ext}`;

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const buffer = Buffer.from(bytes);
  const filePath = path.join(uploadsDir, uniqueName);
  await writeFile(filePath, buffer);

  const record = await prisma.activityTemplateFile.create({
    data: {
      templateId: id,
      fileName: file.name,
      fileUrl: `/uploads/${uniqueName}`,
      fileSize: file.size,
      mimeType: file.type,
      uploadedById: session!.user.id,
    },
  });

  return NextResponse.json(record, { status: 201 });
}, { roles: ["owner", "head_office", "admin"] });
