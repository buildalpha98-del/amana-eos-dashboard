import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { saveUploadedBuffer } from "@/app/api/_lib/upload";
import type { PolicyDocumentCategory } from "@prisma/client";

const POLICY_CATEGORIES = ["policy", "procedure", "other"] as const;
const ADMIN_ROLES = ["owner", "head_office", "admin"] as const;

const createPolicySchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(POLICY_CATEGORIES).default("policy"),
});

// GET /api/policies — list all non-archived policy documents.
// Every authenticated user can read this. Admin and non-admin get the
// same payload (the staff page just renders different controls).
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const includeArchived = searchParams.get("includeArchived") === "true";

  const where: { category?: PolicyDocumentCategory; isArchived?: boolean } = {};
  if (category && (POLICY_CATEGORIES as readonly string[]).includes(category)) {
    where.category = category as PolicyDocumentCategory;
  }
  if (!includeArchived) {
    where.isArchived = false;
  }

  const docs = await prisma.policyDocument.findMany({
    where,
    include: {
      currentVersion: {
        select: {
          id: true,
          versionNumber: true,
          fileName: true,
          fileSize: true,
          uploadedAt: true,
          uploadedBy: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Which current versions has the caller acknowledged?
  const currentVersionIds = docs
    .map((d) => d.currentVersionId)
    .filter((id): id is string => !!id);

  const myAcks = currentVersionIds.length
    ? await prisma.policyDocumentAcknowledgement.findMany({
        where: { userId: session.user.id, versionId: { in: currentVersionIds } },
        select: { versionId: true, acknowledgedAt: true },
      })
    : [];

  const ackByVersionId = new Map(myAcks.map((a) => [a.versionId, a.acknowledgedAt]));

  return NextResponse.json(
    docs.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      category: d.category,
      isArchived: d.isArchived,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      currentVersion: d.currentVersion,
      myAcknowledgedAt: d.currentVersionId
        ? ackByVersionId.get(d.currentVersionId) ?? null
        : null,
    })),
  );
});

// POST /api/policies — create a new policy document with its initial PDF.
// Multipart: title, description?, category, file. Returns the new doc with
// its version-1 attachment.
export const POST = withApiAuth(
  async (req, session) => {
    const form = await req.formData().catch(() => null);
    if (!form) throw ApiError.badRequest("Expected multipart/form-data");

    const parsed = createPolicySchema.safeParse({
      title: form.get("title"),
      description: form.get("description") ?? undefined,
      category: form.get("category") ?? "policy",
    });
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }

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

    // Title uniqueness check up-front so we get a clean 409 rather than a
    // Postgres unique-violation surfacing as 500.
    const existingTitle = await prisma.policyDocument.findUnique({
      where: { title: parsed.data.title },
      select: { id: true },
    });
    if (existingTitle) {
      throw ApiError.conflict("A policy with that title already exists");
    }

    const result = await prisma.$transaction(async (tx) => {
      const doc = await tx.policyDocument.create({
        data: {
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          category: parsed.data.category,
        },
      });

      const version = await tx.policyDocumentVersion.create({
        data: {
          documentId: doc.id,
          versionNumber: 1,
          fileUrl: upload.fileUrl,
          fileName: upload.fileName,
          fileSize: upload.fileSize,
          uploadedById: session.user.id,
        },
      });

      const linked = await tx.policyDocument.update({
        where: { id: doc.id },
        data: { currentVersionId: version.id },
        include: { currentVersion: true },
      });

      return linked;
    });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "create",
        entityType: "PolicyDocument",
        entityId: result.id,
        details: { title: result.title, category: result.category },
      },
    });

    return NextResponse.json(result, { status: 201 });
  },
  { roles: [...ADMIN_ROLES] },
);
