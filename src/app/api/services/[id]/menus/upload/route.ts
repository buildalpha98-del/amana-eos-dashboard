import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import path from "path";
import { writeFile, mkdir } from "fs/promises";

const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// POST /api/services/[id]/menus/upload — upload menu file
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const weekStart = formData.get("weekStart") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!weekStart) {
    return NextResponse.json({ error: "weekStart required" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: PDF, PNG, JPEG, WebP" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 10MB" },
      { status: 400 }
    );
  }

  // Save file
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  const ext = path.extname(sanitizedName);
  const baseName = path.basename(sanitizedName, ext);
  const finalName = `${baseName}-${timestamp}${ext}`;

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, finalName), buffer);

  const fileUrl = `/uploads/${finalName}`;
  const weekDate = new Date(weekStart);

  // Upsert menu week with file info
  const menuWeek = await prisma.menuWeek.upsert({
    where: {
      serviceId_weekStart: {
        serviceId: id,
        weekStart: weekDate,
      },
    },
    update: {
      fileUrl,
      fileName: file.name,
    },
    create: {
      serviceId: id,
      weekStart: weekDate,
      fileUrl,
      fileName: file.name,
      createdById: session!.user.id,
    },
    include: {
      items: { orderBy: [{ day: "asc" }, { slot: "asc" }] },
      createdBy: { select: { id: true, name: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "MenuWeek",
      entityId: menuWeek.id,
      details: { serviceId: id, weekStart, action: "upload_menu_file", fileName: file.name },
    },
  });

  return NextResponse.json(menuWeek);
}
