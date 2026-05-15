import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { saveUploadedBuffer } from "@/app/api/_lib/upload";

const ADMIN_ROLES = ["owner", "head_office", "admin"] as const;

// POST /api/policies/[id]/versions — upload a new PDF version of an existing
// policy. Auto-bumps versionNumber, repoints currentVersion. Because
// acknowledgements are keyed on versionId, every staff member is automatically
// "pending re-acknowledgement" on the new version (no rows to clear).
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    const doc = await prisma.policyDocument.findUnique({
      where: { id },
      select: { id: true, title: true, isArchived: true },
    });
    if (!doc) throw ApiError.notFound("Policy not found");
    if (doc.isArchived) {
      throw ApiError.badRequest("Cannot upload a version to an archived policy");
    }

    const form = await req.formData().catch(() => null);
    if (!form) throw ApiError.badRequest("Expected multipart/form-data");

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw ApiError.badRequest("A PDF file is required");
    }
    if (file.size === 0) {
      throw ApiError.badRequest("Uploaded file is empty");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let upload;
    try {
      upload = await saveUploadedBuffer(buffer, file.name, "policies", {
        allowedExtensions: [".pdf"],
        requiredMimeType: "application/pdf",
        mimeType: file.type,
      });
    } catch (err) {
      throw ApiError.badRequest((err as Error).message);
    }

    // Compute next version number — read the current max and add 1. Wrapped
    // in the transaction so a concurrent upload can't race us into duplicate
    // versionNumbers (the unique constraint catches it; we surface 409).
    const result = await prisma.$transaction(async (tx) => {
      const last = await tx.policyDocumentVersion.findFirst({
        where: { documentId: id },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      const nextNumber = (last?.versionNumber ?? 0) + 1;

      const version = await tx.policyDocumentVersion.create({
        data: {
          documentId: id,
          versionNumber: nextNumber,
          fileUrl: upload.fileUrl,
          fileName: upload.fileName,
          fileSize: upload.fileSize,
          uploadedById: session.user.id,
        },
      });

      await tx.policyDocument.update({
        where: { id },
        data: { currentVersionId: version.id },
      });

      return version;
    });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "version",
        entityType: "PolicyDocument",
        entityId: id,
        details: { title: doc.title, versionNumber: result.versionNumber },
      },
    });

    return NextResponse.json(result, { status: 201 });
  },
  { roles: [...ADMIN_ROLES] },
);
