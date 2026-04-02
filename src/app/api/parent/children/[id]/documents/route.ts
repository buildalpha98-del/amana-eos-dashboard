import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const createDocumentSchema = z.object({
  docType: z.enum(["immunisation", "medical_action_plan", "birth_certificate", "custody_order", "other"]),
  fileName: z.string().min(1, "fileName is required"),
  fileUrl: z.string().min(1, "fileUrl is required"),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
});

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

  await verifyChildAccess(childId, ctx.parent.enrolmentIds);

  const documents = await prisma.parentDocument.findMany({
    where: { childId },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json(documents);
});

export const POST = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  if (!childId) throw ApiError.badRequest("childId is required");

  await verifyChildAccess(childId, ctx.parent.enrolmentIds);

  const body = await parseJsonBody(req);
  const parsed = createDocumentSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid document data", parsed.error.flatten().fieldErrors);
  }

  // Find parent's contact record for this child's service
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
    // Create a placeholder contact if none exists
    throw ApiError.badRequest("No contact record found for this service. Please contact the centre.");
  }

  const doc = await prisma.parentDocument.create({
    data: {
      childId,
      contactId,
      docType: parsed.data.docType,
      fileName: parsed.data.fileName,
      fileUrl: parsed.data.fileUrl, // TODO: Replace with S3 upload URL
      expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : undefined,
      notes: parsed.data.notes,
    },
  });

  return NextResponse.json(doc, { status: 201 });
});
