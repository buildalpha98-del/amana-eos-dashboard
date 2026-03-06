import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

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
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const files = await prisma.activityTemplateFile.findMany({
    where: { templateId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(files);
}

// POST /api/activity-templates/[id]/files — upload file
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

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

  const ext = path.extname(file.name) || "";
  const baseName = path
    .basename(file.name, ext)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .substring(0, 50);
  const uniqueName = `${baseName}-${Date.now()}${ext}`;

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const bytes = await file.arrayBuffer();
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
}
