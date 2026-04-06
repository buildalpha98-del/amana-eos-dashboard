import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { put } from "@vercel/blob";
import { z } from "zod";
import { ChildDocumentType } from "@prisma/client";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const documentTypeSchema = z.nativeEnum(ChildDocumentType);

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const child = await prisma.child.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!child) throw ApiError.notFound("Child not found");

  const documents = await prisma.childDocument.findMany({
    where: { childId: id },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ documents });
});

export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const child = await prisma.child.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!child) throw ApiError.notFound("Child not found");

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const docType = formData.get("documentType") as string | null;

  if (!file) throw ApiError.badRequest("File is required");
  if (!docType) throw ApiError.badRequest("Document type is required");

  const parsedType = documentTypeSchema.safeParse(docType);
  if (!parsedType.success) {
    throw ApiError.badRequest("Invalid document type");
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw ApiError.badRequest("Only PDF and image files are allowed");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw ApiError.badRequest("File size must be under 10MB");
  }

  const blob = await put(`children/${id}/documents/${file.name}`, file, {
    access: "public",
    contentType: file.type,
  });

  const document = await prisma.childDocument.create({
    data: {
      childId: id,
      documentType: parsedType.data,
      fileName: file.name,
      fileUrl: blob.url,
      uploadedById: session!.user.id,
    },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(document, { status: 201 });
});
