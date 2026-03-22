import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadFile, deleteFile } from "@/lib/storage";
import { withApiAuth } from "@/lib/server-auth";
import { validateFileContent } from "@/lib/file-validation";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// POST /api/users/[id]/avatar — upload or replace avatar
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const isAdmin = ["owner", "admin"].includes(session!.user.role);
  const isSelf = session!.user.id === id;

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, avatar: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "File must be a JPEG, PNG, WebP, or GIF image." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File size must be under 5MB." },
      { status: 400 }
    );
  }

  // Validate file content matches declared MIME type
  const arrayBuf = await file.arrayBuffer();
  if (!validateFileContent(arrayBuf, file.type)) {
    return NextResponse.json(
      { error: "File content does not match declared type" },
      { status: 400 },
    );
  }

  // Convert file to buffer
  const buffer = Buffer.from(arrayBuf);

  // Determine extension from MIME type
  const ext = file.type === "image/png" ? ".png"
    : file.type === "image/webp" ? ".webp"
    : file.type === "image/gif" ? ".gif"
    : ".jpg";

  const filename = `avatar-${id}-${Date.now()}${ext}`;

  // Upload to Vercel Blob
  const { url } = await uploadFile(buffer, filename, {
    contentType: file.type,
    folder: "avatars",
  });

  // Delete old avatar if it exists and is a blob URL
  if (user.avatar && user.avatar.includes("blob")) {
    try {
      await deleteFile(user.avatar);
    } catch {
      // Ignore deletion errors for old avatars
    }
  }

  // Update user record
  await prisma.user.update({
    where: { id },
    data: { avatar: url },
  });

  return NextResponse.json({ avatar: url });
});

// DELETE /api/users/[id]/avatar — remove avatar
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const isAdmin = ["owner", "admin"].includes(session!.user.role);
  const isSelf = session!.user.id === id;

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, avatar: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Delete blob if exists
  if (user.avatar && user.avatar.includes("blob")) {
    try {
      await deleteFile(user.avatar);
    } catch {
      // Ignore deletion errors
    }
  }

  await prisma.user.update({
    where: { id },
    data: { avatar: null },
  });

  return NextResponse.json({ avatar: null });
});
