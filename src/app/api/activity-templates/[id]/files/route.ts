import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { safeAttachmentUrl } from "@/lib/schemas/message-attachments";
import { UPLOAD_ALLOWED_MIMES } from "@/lib/upload-strategy";

/**
 * 2026-09-25: this route used to accept the raw file as multipart and write it
 * with `fs.writeFile` into `process.cwd()/public/uploads`, storing
 * `fileUrl: "/uploads/<name>"`. On Vercel the serverless filesystem is
 * read-only outside /tmp and is discarded between invocations, so in
 * production the write failed (or the bytes vanished) and the DB row was left
 * pointing at a URL that 404s. Template attachments have never worked there.
 *
 * It now follows the house convention documented in CLAUDE.md: the client
 * calls `uploadFileSmart()`, which compresses, routes around the ~4.5 MB
 * serverless body cap, sniffs magic bytes and returns a Vercel Blob URL. This
 * route only records the resulting metadata — and only ever accepts a URL on
 * our own Blob host (`safeAttachmentUrl`), never an arbitrary one.
 */

const fileInputSchema = z.object({
  fileName: z.string().min(1).max(300),
  fileUrl: safeAttachmentUrl,
  fileSize: z.number().int().min(0),
  mimeType: z.enum(UPLOAD_ALLOWED_MIMES),
});

// GET /api/activity-templates/[id]/files
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const files = await prisma.activityTemplateFile.findMany({
    where: { templateId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(files);
});

// POST /api/activity-templates/[id]/files — record an uploaded file
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    const template = await prisma.activityTemplate.findFirst({
      where: { id, deleted: false },
      select: { id: true },
    });
    if (!template) throw ApiError.notFound("Template not found");

    const body = await parseJsonBody(req);
    const parsed = fileInputSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid file details", parsed.error.flatten());
    }

    const record = await prisma.activityTemplateFile.create({
      data: {
        templateId: id,
        fileName: parsed.data.fileName,
        fileUrl: parsed.data.fileUrl,
        fileSize: parsed.data.fileSize,
        mimeType: parsed.data.mimeType,
        uploadedById: session!.user.id,
      },
    });

    return NextResponse.json(record, { status: 201 });
  },
  { roles: [...ADMIN_ROLES] },
);
