import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { del } from "@vercel/blob";

export const DELETE = withApiAuth(async (req, session, context) => {
  const { id, documentId } = await context!.params!;

  const document = await prisma.childDocument.findFirst({
    where: { id: documentId, childId: id },
  });

  if (!document) throw ApiError.notFound("Document not found");

  // Delete from Vercel Blob and database
  await del(document.fileUrl);
  await prisma.childDocument.delete({ where: { id: documentId } });

  return NextResponse.json({ success: true });
});
