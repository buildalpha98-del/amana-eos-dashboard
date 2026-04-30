import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { uploadFile } from "@/lib/storage";

const renewSchema = z.object({
  /// New issue date for the renewed certificate (ISO).
  issueDate: z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "issueDate must be a valid date",
  }),
  /// New expiry date for the renewed certificate (ISO).
  expiryDate: z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "expiryDate must be a valid date",
  }),
  /// Optional notes override; if omitted, the predecessor's notes carry over.
  notes: z.string().nullable().optional(),
  /// Optional alertDays override; defaults to predecessor's value.
  alertDays: z.number().int().min(0).max(365).optional(),
  /// Optional pre-uploaded file URL (when not using multipart upload).
  fileUrl: z.string().url().nullable().optional(),
  fileName: z.string().nullable().optional(),
});

/**
 * POST /api/compliance/[id]/renew
 *
 * Atomically:
 *   1. Creates a new ComplianceCertificate with the same type/userId/
 *      serviceId/label as the predecessor and the new issue + expiry dates.
 *   2. Sets `previousCertificateId` on the new cert → predecessor.id, forming
 *      the renewal chain.
 *   3. Sets `supersededAt = now()` on the predecessor so reports can filter
 *      "current" vs "historical" certs.
 *
 * Both writes happen in a single Prisma transaction. The endpoint accepts
 * either JSON body or multipart/form-data (with optional `file` part) so
 * the renewal flow can upload a fresh certificate scan in one request.
 *
 * Permissions: admin can renew anyone's; staff can renew their own (where
 * cert.userId === session.user.id). Coordinators are admin-equivalent for
 * service-scoped renewals via `isAdminRole`.
 */
export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const role = session!.user.role ?? "";
  const viewerId = session!.user.id;

  const existing = await prisma.complianceCertificate.findUnique({
    where: { id },
  });
  if (!existing) throw ApiError.notFound("Certificate not found");

  if (existing.supersededAt) {
    throw ApiError.badRequest(
      "This certificate has already been renewed. Renew the latest cert in the chain instead.",
    );
  }

  const isOwnCert = !!existing.userId && existing.userId === viewerId;
  if (!isAdminRole(role) && role !== "member" && !isOwnCert) {
    throw ApiError.forbidden();
  }

  // Coordinators are limited to certs at their own service.
  if (role === "member" && existing.serviceId !== session!.user.serviceId) {
    throw ApiError.forbidden();
  }

  const contentType = req.headers.get("content-type") ?? "";

  let rawData: unknown;
  let uploadedFileUrl: string | null = null;
  let uploadedFileName: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const jsonStr = form.get("data");
    if (typeof jsonStr !== "string") {
      throw ApiError.badRequest("Missing 'data' field in multipart body");
    }
    try {
      rawData = JSON.parse(jsonStr);
    } catch {
      throw ApiError.badRequest("Invalid JSON in 'data' field");
    }

    const file = form.get("file");
    if (file && typeof file !== "string" && (file as File).size > 0) {
      const fileObj = file as File;
      const buffer = Buffer.from(await fileObj.arrayBuffer());
      const folderKey = existing.userId ?? existing.serviceId;
      const uploaded = await uploadFile(buffer, fileObj.name, {
        contentType: fileObj.type || undefined,
        folder: `compliance/${folderKey}`,
      });
      uploadedFileUrl = uploaded.url;
      uploadedFileName = fileObj.name;
    }
  } else {
    rawData = await parseJsonBody(req);
  }

  const parsed = renewSchema.safeParse(rawData);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  }

  const newIssue = new Date(parsed.data.issueDate);
  const newExpiry = new Date(parsed.data.expiryDate);
  if (newExpiry <= newIssue) {
    throw ApiError.badRequest("expiryDate must be after issueDate");
  }
  if (newExpiry <= existing.expiryDate) {
    throw ApiError.badRequest(
      "Renewed expiry must be later than the predecessor's expiry — this is a renewal, not a replacement.",
    );
  }

  const finalFileUrl = uploadedFileUrl ?? parsed.data.fileUrl ?? null;
  const finalFileName = uploadedFileName ?? parsed.data.fileName ?? null;

  // Atomic: create new + supersede old in one transaction.
  const renewed = await prisma.$transaction(async (tx) => {
    const created = await tx.complianceCertificate.create({
      data: {
        serviceId: existing.serviceId,
        userId: existing.userId,
        type: existing.type,
        label: existing.label,
        issueDate: newIssue,
        expiryDate: newExpiry,
        notes:
          parsed.data.notes !== undefined
            ? parsed.data.notes
            : existing.notes,
        alertDays: parsed.data.alertDays ?? existing.alertDays,
        fileUrl: finalFileUrl,
        fileName: finalFileName,
        previousCertificateId: existing.id,
        // acknowledged + alertDays defaults match a fresh cert
        acknowledged: false,
      },
      include: {
        service: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await tx.complianceCertificate.update({
      where: { id: existing.id },
      data: { supersededAt: new Date() },
    });

    return created;
  });

  await prisma.activityLog.create({
    data: {
      userId: viewerId,
      action: "renew",
      entityType: "ComplianceCertificate",
      entityId: renewed.id,
      details: {
        type: renewed.type,
        previousCertificateId: existing.id,
        forUserId: existing.userId,
        selfRenew: isOwnCert,
      },
    },
  });

  return NextResponse.json(renewed, { status: 201 });
});
