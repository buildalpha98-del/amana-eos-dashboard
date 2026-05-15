import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

// GET /api/policies/[id]/file — authenticated PDF proxy.
//
// Streams the current version's PDF from Vercel Blob through the
// server so the underlying blob URL never reaches the client. Any
// authenticated user (including marketing) can view; only writes are
// gated to admin roles. ?version=<id> selects an older version.
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const { searchParams } = new URL(req.url);
  const requestedVersionId = searchParams.get("version");

  const doc = await prisma.policyDocument.findUnique({
    where: { id },
    select: { id: true, currentVersionId: true, isArchived: true },
  });
  if (!doc) throw ApiError.notFound("Policy not found");

  const versionId = requestedVersionId ?? doc.currentVersionId;
  if (!versionId) {
    throw ApiError.notFound("Policy has no file available");
  }

  const version = await prisma.policyDocumentVersion.findUnique({
    where: { id: versionId },
    select: { id: true, documentId: true, fileUrl: true, fileName: true, fileSize: true },
  });
  if (!version || version.documentId !== id) {
    throw ApiError.notFound("Policy version not found");
  }

  const blobRes = await fetch(version.fileUrl);
  if (!blobRes.ok || !blobRes.body) {
    throw new ApiError(502, "Failed to fetch policy file from storage");
  }

  // Sanitise the filename for the Content-Disposition header — strip CR/LF
  // and quotes to avoid header-injection from a malicious upload name.
  const safeName = version.fileName.replace(/["\r\n]/g, "_");

  return new NextResponse(blobRes.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(version.fileSize),
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
