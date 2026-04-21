import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { uploadFile, deleteFile } from "@/lib/storage";
import { isAdminRole } from "@/lib/role-permissions";
const updateCertSchema = z.object({
  type: z.enum(["wwcc", "first_aid", "anaphylaxis", "asthma", "cpr", "police_check", "annual_review", "other"]).optional(),
  label: z.string().nullable().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  notes: z.string().nullable().optional(),
  alertDays: z.number().optional(),
  acknowledged: z.boolean().optional(),
  fileUrl: z.string().nullable().optional(),
  fileName: z.string().nullable().optional(),
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  // Resource-level access check (mirrors /api/compliance/[id]/download auth matrix):
  //   - Own cert: allowed
  //   - Admin role: allowed
  //   - Coordinator whose service matches the cert's service: allowed
  //   - Anyone else: 403
  const existing = await prisma.complianceCertificate.findUnique({
    where: { id },
    select: { id: true, userId: true, serviceId: true, fileUrl: true },
  });
  if (!existing) throw ApiError.notFound("Certificate not found");

  const viewerId = session.user.id;
  const viewerRole = session.user.role ?? "";
  const isOwn = existing.userId === viewerId;
  const isAdmin = isAdminRole(viewerRole);

  let canAccess = isOwn || isAdmin;
  if (!canAccess && viewerRole === "coordinator") {
    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { serviceId: true },
    });
    canAccess = !!viewer?.serviceId && viewer.serviceId === existing.serviceId;
  }
  if (!canAccess) throw ApiError.forbidden();

  const contentType = req.headers.get("content-type") ?? "";

  let rawData: unknown;
  let uploadedFileUrl: string | null = null;
  let uploadedFileName: string | null = null;
  let replaceFile = false;

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
      const folderKey = existing.userId ?? existing.serviceId ?? "service";
      const uploaded = await uploadFile(buffer, fileObj.name, {
        contentType: fileObj.type || undefined,
        folder: `compliance/${folderKey}`,
      });
      uploadedFileUrl = uploaded.url;
      uploadedFileName = fileObj.name;
      replaceFile = true;

      if (existing.fileUrl) {
        try {
          await deleteFile(existing.fileUrl);
        } catch {
          // Ignore delete failures — don't block the upload on orphan cleanup
        }
      }
    }
  } else {
    rawData = await parseJsonBody(req);
  }

  const parsed = updateCertSchema.safeParse(rawData);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.issueDate) data.issueDate = new Date(parsed.data.issueDate);
  if (parsed.data.expiryDate) data.expiryDate = new Date(parsed.data.expiryDate);
  if (replaceFile) {
    data.fileUrl = uploadedFileUrl;
    data.fileName = uploadedFileName;
  }

  const cert = await prisma.complianceCertificate.update({
    where: { id },
    data,
    include: {
      service: { select: { id: true, name: true, code: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(cert);
}, { roles: ["owner", "head_office", "admin", "coordinator", "staff", "member"] });

export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const cert = await prisma.complianceCertificate.findUnique({
    where: { id },
    select: { fileUrl: true },
  });
  if (cert?.fileUrl) {
    try {
      await deleteFile(cert.fileUrl);
    } catch {
      // Ignore blob deletion errors — DB row will still be deleted
    }
  }
  await prisma.complianceCertificate.delete({ where: { id } });
  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });
