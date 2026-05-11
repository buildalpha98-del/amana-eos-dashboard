import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadFile, deleteFile } from "@/lib/storage";
import { withApiAuth } from "@/lib/server-auth";
import { validateFileContent } from "@/lib/file-validation";
import { ADMIN_ROLES } from "@/lib/role-permissions";

// Keep under Vercel's serverless body-size limit (~4.5 MB) so a
// rejected upload returns a clean 413 here instead of a
// `TypeError: Failed to fetch` from the platform dropping the
// connection mid-stream. The client-side check in the profile page
// mirrors this so users see a clean toast before the upload starts.
const MAX_SIZE = 4 * 1024 * 1024; // 4 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

// Some phone browsers send `image/jpg` (no `e`); normalise to the
// canonical `image/jpeg` before lookup so the upload doesn't fall
// through to the type-rejection branch.
function normaliseMime(mime: string): string {
  if (mime === "image/jpg") return "image/jpeg";
  return mime;
}

/**
 * Resolve whether the viewer may manage the target user's avatar.
 *
 * Allowed:
 *   - Self (viewer is the target user)
 *   - Admin roles (owner / head_office / admin)
 *   - Coordinator, if the target user shares the coordinator's service
 */
async function canManageAvatar(
  viewerId: string,
  viewerRole: string,
  targetId: string,
): Promise<boolean> {
  if (viewerId === targetId) return true;
  if ((ADMIN_ROLES as readonly string[]).includes(viewerRole)) return true;
  if (viewerRole === "member") {
    const [target, viewer] = await Promise.all([
      prisma.user.findUnique({ where: { id: targetId }, select: { serviceId: true } }),
      prisma.user.findUnique({ where: { id: viewerId }, select: { serviceId: true } }),
    ]);
    return !!target?.serviceId && target.serviceId === viewer?.serviceId;
  }
  return false;
}

// POST /api/users/[id]/avatar — upload or replace avatar
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const allowed = await canManageAvatar(session!.user.id, session!.user.role, id);
  if (!allowed) {
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

  const mime = normaliseMime(file.type);
  if (!ALLOWED_TYPES.has(mime)) {
    return NextResponse.json(
      { error: "File must be a JPEG, PNG, WebP, GIF or HEIC image." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File size must be under 4MB." },
      { status: 413 }
    );
  }

  // Validate file content matches declared MIME type
  const arrayBuf = await file.arrayBuffer();
  if (!validateFileContent(arrayBuf, mime)) {
    return NextResponse.json(
      { error: "File content does not match declared type" },
      { status: 400 },
    );
  }

  // Convert file to buffer
  const buffer = Buffer.from(arrayBuf);

  // Determine extension from MIME type
  const ext =
    mime === "image/png" ? ".png"
    : mime === "image/webp" ? ".webp"
    : mime === "image/gif" ? ".gif"
    : mime === "image/heic" || mime === "image/heif" ? ".heic"
    : ".jpg";

  const filename = `avatar-${id}-${Date.now()}${ext}`;

  // Upload to Vercel Blob
  const { url } = await uploadFile(buffer, filename, {
    contentType: mime,
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
  const allowed = await canManageAvatar(session!.user.id, session!.user.role, id);
  if (!allowed) {
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
