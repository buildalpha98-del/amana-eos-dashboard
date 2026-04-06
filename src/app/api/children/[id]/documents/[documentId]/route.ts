import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { deleteFile } from "@/lib/storage/uploadFile";

const updateSchema = z.object({
  isVerified: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

// PATCH — update document metadata (verify, expiry, notes)
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id, documentId } = await context!.params!;

  const body = await parseJsonBody(req);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid update data", parsed.error.flatten().fieldErrors);
  }

  const existing = await prisma.childDocument.findFirst({
    where: { id: documentId, childId: id },
  });
  if (!existing) throw ApiError.notFound("Document not found");

  const updateData: Record<string, unknown> = {};
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.expiresAt !== undefined) {
    updateData.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  }
  if (parsed.data.isVerified !== undefined) {
    updateData.isVerified = parsed.data.isVerified;
    if (parsed.data.isVerified) {
      updateData.verifiedById = session!.user.id;
      updateData.verifiedAt = new Date();
    } else {
      updateData.verifiedById = null;
      updateData.verifiedAt = null;
    }
  }

  const updated = await prisma.childDocument.update({
    where: { id: documentId },
    data: updateData,
    select: {
      id: true,
      documentType: true,
      fileName: true,
      fileUrl: true,
      uploaderType: true,
      expiresAt: true,
      isVerified: true,
      verifiedAt: true,
      notes: true,
      createdAt: true,
      uploadedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
});

// DELETE — remove document and its blob
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id, documentId } = await context!.params!;

  const document = await prisma.childDocument.findFirst({
    where: { id: documentId, childId: id },
  });

  if (!document) throw ApiError.notFound("Document not found");

  await deleteFile(document.fileUrl);
  await prisma.childDocument.delete({ where: { id: documentId } });

  return NextResponse.json({ success: true });
});
