import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage/uploadFile";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

async function verifyChildAccess(childId: string, enrolmentIds: string[]) {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, enrolmentId: true },
  });
  if (!child) throw ApiError.notFound("Child not found");
  if (!child.enrolmentId || !enrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }
  return child;
}

export const GET = withParentAuth(async (_req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  if (!childId) throw ApiError.badRequest("childId is required");

  const child = await verifyChildAccess(childId, ctx.parent.enrolmentIds);

  // Return ChildDocument records (staff + parent uploaded)
  const documents = await prisma.childDocument.findMany({
    where: { childId },
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
    },
    orderBy: { createdAt: "desc" },
  });

  // Also include ParentDocument records for backward compat
  const parentDocs = await prisma.parentDocument.findMany({
    where: { childId },
    orderBy: { uploadedAt: "desc" },
  });

  // Files the family uploaded during the enrolment form live on the
  // SUBMISSION as JSON, not as ChildDocument rows — so a parent who'd
  // just uploaded a birth certificate and an immunisation history saw an
  // empty Documents tab and no way to tell whether it had arrived.
  // Listed read-only; replacing one means uploading a new version, which
  // is what the office wants anyway (the original stays as the record of
  // what was supplied at enrolment).
  const enrolmentDocs: EnrolmentDoc[] = [];
  if (child.enrolmentId) {
    const sub = await prisma.enrolmentSubmission.findUnique({
      where: { id: child.enrolmentId },
      select: {
        documentUploads: true,
        medicalFiles: true,
        courtOrderFiles: true,
        createdAt: true,
      },
    });
    if (sub) {
      const push = (raw: unknown, fallbackLabel: string) => {
        for (const entry of toFileList(raw)) {
          enrolmentDocs.push({
            id: `enrol:${entry.url}`,
            label: entry.label || fallbackLabel,
            fileName: entry.name || fallbackLabel,
            fileUrl: entry.url,
            uploadedAt: sub.createdAt,
          });
        }
      };
      push(sub.documentUploads, "Enrolment document");
      push(sub.medicalFiles, "Medical document");
      push(sub.courtOrderFiles, "Court order");
    }
  }

  return NextResponse.json({ documents, parentDocs, enrolmentDocs });
});

interface EnrolmentDoc {
  id: string;
  label: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: Date;
}

/**
 * The enrolment form has stored uploads in more than one shape over its
 * life — a bare array of urls, an array of objects, and a keyed object
 * of them. Read all three rather than making old families' documents
 * disappear.
 */
function toFileList(
  raw: unknown,
): { url: string; name?: string; label?: string }[] {
  const out: { url: string; name?: string; label?: string }[] = [];
  const take = (v: unknown, key?: string) => {
    if (typeof v === "string" && v.startsWith("http")) {
      out.push({ url: v, label: key });
      return;
    }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url : null;
      if (url) {
        out.push({
          url,
          name: typeof o.name === "string" ? o.name : undefined,
          label: typeof o.label === "string" ? o.label : key,
        });
      }
    }
  };

  if (Array.isArray(raw)) {
    for (const v of raw) take(v);
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(v)) for (const item of v) take(item, k);
      else take(v, k);
    }
  }
  return out;
}

const documentTypeMap: Record<string, string> = {
  immunisation: "IMMUNISATION_RECORD",
  medical_action_plan: "ANAPHYLAXIS_PLAN",
  birth_certificate: "OTHER",
  custody_order: "COURT_ORDER",
  other: "OTHER",
};

export const POST = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  if (!childId) throw ApiError.badRequest("childId is required");

  await verifyChildAccess(childId, ctx.parent.enrolmentIds);

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    // Real file upload flow
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const docType = formData.get("documentType") as string | null;
    const name = formData.get("name") as string | null;
    const expiresAtStr = formData.get("expiresAt") as string | null;

    if (!file) throw ApiError.badRequest("File is required");
    if (!docType) throw ApiError.badRequest("Document type is required");

    if (!ALLOWED_TYPES.includes(file.type)) {
      throw ApiError.badRequest("Only PDF and image files are allowed");
    }
    if (file.size > MAX_FILE_SIZE) {
      throw ApiError.badRequest("File size must be under 10MB");
    }

    // Map legacy parent doc types to ChildDocumentType enum
    const mappedType = documentTypeMap[docType] || docType;
    const validTypes = ["ANAPHYLAXIS_PLAN", "ASTHMA_PLAN", "MEDICAL_CERTIFICATE", "IMMUNISATION_RECORD", "COURT_ORDER", "OTHER"];
    if (!validTypes.includes(mappedType)) {
      throw ApiError.badRequest("Invalid document type");
    }

    // Find a staff user to use as uploadedById (system upload)
    const systemUser = await prisma.user.findFirst({
      where: { role: "owner" },
      select: { id: true },
    });

    const url = await uploadFile(
      file,
      `documents/${childId}/parent/${file.name}`,
      file.type,
    );

    const document = await prisma.childDocument.create({
      data: {
        childId,
        documentType: mappedType as "ANAPHYLAXIS_PLAN" | "ASTHMA_PLAN" | "MEDICAL_CERTIFICATE" | "IMMUNISATION_RECORD" | "COURT_ORDER" | "OTHER",
        fileName: name || file.name,
        fileUrl: url,
        uploadedById: systemUser?.id || "system",
        uploaderType: "parent",
        isVerified: false,
        expiresAt: expiresAtStr ? new Date(expiresAtStr) : undefined,
      },
      select: {
        id: true,
        documentType: true,
        fileName: true,
        fileUrl: true,
        uploaderType: true,
        expiresAt: true,
        isVerified: true,
        createdAt: true,
      },
    });

    return NextResponse.json(document, { status: 201 });
  }

  // Legacy JSON flow — keep backward compat with ParentDocument
  const createSchema = z.object({
    docType: z.enum(["immunisation", "medical_action_plan", "birth_certificate", "custody_order", "other"]),
    fileName: z.string().min(1),
    fileUrl: z.string().min(1),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().max(500).optional(),
  });

  const body = await parseJsonBody(req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid document data", parsed.error.flatten().fieldErrors);
  }

  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { serviceId: true, enrolment: { select: { serviceId: true } } },
  });
  const serviceId = child?.serviceId ?? child?.enrolment?.serviceId;

  let contactId: string | undefined;
  if (serviceId) {
    const contact = await prisma.centreContact.findFirst({
      where: { email: ctx.parent.email.toLowerCase(), serviceId },
      select: { id: true },
    });
    contactId = contact?.id;
  }

  if (!contactId) {
    throw ApiError.badRequest("No contact record found for this service. Please contact the centre.");
  }

  const doc = await prisma.parentDocument.create({
    data: {
      childId,
      contactId,
      docType: parsed.data.docType,
      fileName: parsed.data.fileName,
      fileUrl: parsed.data.fileUrl,
      expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : undefined,
      notes: parsed.data.notes,
    },
  });

  return NextResponse.json(doc, { status: 201 });
});
