import { NextResponse } from "next/server";
import { z } from "zod";
import { CertificateType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import { parsePagination } from "@/lib/pagination";
import { withApiAuth } from "@/lib/server-auth";

import { ApiError, parseJsonBody } from "@/lib/api-error";
import { uploadFile } from "@/lib/storage";
// Reject expiry dates that fall before today — uploading an already-expired
// cert is a UX trap (the row would immediately read "expired"). Today itself
// is accepted because a cert valid for the rest of the day is still valid.
function isPastDate(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const value = new Date(dateStr);
  if (Number.isNaN(value.getTime())) return false; // shape validated separately
  value.setHours(0, 0, 0, 0);
  return value.getTime() < today.getTime();
}

const createCertSchema = z.object({
  serviceId: z.string().min(1),
  userId: z.string().optional().nullable(),
  // 2026-06-04: was a hard-coded literal list of 8 types that fell out
  // of sync when child_protection / geccko / food_safety / food_handler
  // / mandatory_reporter_training / child_safe_code_of_conduct were
  // added to the Prisma enum. Staff hit "Invalid option" trying to
  // upload a Child Safe Code of Conduct cert. Sourcing the type
  // directly from the Prisma enum prevents this drift in future.
  type: z.nativeEnum(CertificateType),
  label: z.string().optional().nullable(),
  issueDate: z.string().min(1),
  // Nullable so "no expiry" certs can be created (matches schema). Strings
  // get past-date validation downstream so we can return a clear 400 with
  // a useful message rather than a generic Zod issue.
  expiryDate: z.string().min(1).nullable().optional(),
  notes: z.string().optional().nullable(),
  alertDays: z.number().optional(),
  fileUrl: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
});

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const upcoming = searchParams.get("upcoming"); // "30" = next 30 days

  const scope = getServiceScope(session);
  const stateScope = getStateScope(session);
  const role = session!.user.role as string;
  const where: Record<string, unknown> = {};

  // State Manager: only see compliance certs for services in their state
  if (stateScope) where.service = { state: stateScope };

  if (scope) {
    // Staff only see their own certs; member sees their service's certs
    if (role === "staff") {
      where.userId = session!.user.id;
    } else {
      where.serviceId = scope;
    }
  } else if (serviceId) {
    where.serviceId = serviceId;
  }

  if (upcoming) {
    const days = parseInt(upcoming);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    where.expiryDate = { lte: futureDate };
  }

  const include = {
    service: { select: { id: true, name: true, code: true } },
    user: { select: { id: true, name: true, email: true } },
  };
  const orderBy = { expiryDate: "asc" as const };

  const pagination = parsePagination(searchParams);

  if (pagination) {
    const [items, total] = await Promise.all([
      prisma.complianceCertificate.findMany({ where, include, orderBy, skip: pagination.skip, take: pagination.limit }),
      prisma.complianceCertificate.count({ where }),
    ]);
    return NextResponse.json({
      items,
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    });
  }

  const certificates = await prisma.complianceCertificate.findMany({ where, include, orderBy });
  return NextResponse.json(certificates);
});

export const POST = withApiAuth(async (req, session) => {
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
      const folderKey =
        (rawData as { userId?: string; serviceId?: string })?.userId ??
        (rawData as { serviceId?: string })?.serviceId ??
        "service";
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

  const parsed = createCertSchema.safeParse(rawData);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const role = session!.user.role as string;
  const isServiceScoped = role === "staff" || role === "member";

  // Staff/member: force userId to themselves and serviceId to their assigned service
  const finalServiceId = isServiceScoped ? (session!.user.serviceId as string) : parsed.data.serviceId;
  const finalUserId = isServiceScoped ? session!.user.id : (parsed.data.userId || null);

  if (!finalServiceId) {
    return NextResponse.json({ error: "Service ID is required" }, { status: 400 });
  }

  if (parsed.data.expiryDate && isPastDate(parsed.data.expiryDate)) {
    return NextResponse.json(
      { error: "Expiry date can't be in the past — pick today or later." },
      { status: 400 },
    );
  }

  const finalFileUrl = uploadedFileUrl ?? parsed.data.fileUrl ?? null;
  const finalFileName = uploadedFileName ?? parsed.data.fileName ?? null;

  const cert = await prisma.complianceCertificate.create({
    data: {
      serviceId: finalServiceId,
      userId: finalUserId,
      type: parsed.data.type,
      label: parsed.data.label || null,
      issueDate: new Date(parsed.data.issueDate),
      // null when caller indicates "no expiry"; otherwise the supplied date.
      expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
      notes: parsed.data.notes || null,
      alertDays: parsed.data.alertDays ?? 30,
      fileUrl: finalFileUrl,
      fileName: finalFileName,
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "ComplianceCertificate",
      entityId: cert.id,
      details: { type: cert.type, serviceId: cert.serviceId },
    },
  });

  return NextResponse.json(cert, { status: 201 });
});
