import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { z } from "zod";
import { ChildDocumentType } from "@prisma/client";
import { uploadFile } from "@/lib/storage/uploadFile";

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
  const name = formData.get("name") as string | null;
  const expiresAtStr = formData.get("expiresAt") as string | null;
  const notes = formData.get("notes") as string | null;

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

  const url = await uploadFile(
    file,
    `documents/${id}/${docType}/${file.name}`,
    file.type,
  );

  const document = await prisma.childDocument.create({
    data: {
      childId: id,
      documentType: parsedType.data,
      fileName: name || file.name,
      fileUrl: url,
      uploadedById: session!.user.id,
      uploaderType: "staff",
      expiresAt: expiresAtStr ? new Date(expiresAtStr) : undefined,
      notes: notes || undefined,
    },
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

  return NextResponse.json(document, { status: 201 });
});
