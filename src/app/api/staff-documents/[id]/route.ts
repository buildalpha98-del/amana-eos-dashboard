import { type NextRequest } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { canViewStaffDocument } from "@/lib/staff-access";
import { logger } from "@/lib/logger";
import { streamStoredFile } from "@/lib/blob-proxy";

/**
 * GET /api/staff-documents/[id]
 *
 * Access-checked stream of a Document out of blob storage. *
 * 2026-09-15: streams the bytes back over our own origin instead of
 * redirecting to blob storage — a cross-origin redirect is unrenderable in
 * the in-app file viewer, because the app's CSP sets no frame-src and so
 * falls back to `default-src 'self'`. See src/lib/blob-proxy.ts.
 *
 * Used by the staff profile
 * page's Documents tab so HR docs / personal docs aren't exposed via direct
 * blob URLs in the markup.
 *
 * Access is delegated to `canViewStaffDocument` in @/lib/staff-access so this
 * route, the /staff/[id] profile guard and the /api/documents library all
 * answer "who may see this person's HR file?" the same way:
 *
 *   - Document uploader OR assignee is the viewer: allowed
 *   - Viewer is an admin (owner / admin / head_office): allowed
 *   - Viewer is the Director of Service (`member`) at the assignee's centre
 *   - Anyone else: 403
 *
 * 2026-09-14: the same-service branch used to accept ANY role, so an
 * Educator could pull up a colleague's contract or WWCC just by being
 * rostered at the same centre. It is now the Director role only.
 *
 * Returns 404 if the document doesn't exist, is soft-deleted, or has no
 * fileUrl. Optional `?download=1` answers Content-Disposition: attachment so the browser
 * forces a download (Content-Disposition: attachment) instead of inline view —
 * useful for non-PDF MIME types that browsers can't preview.
 */
export const GET = withApiAuth(async (req: NextRequest, session, context) => {
  const { id } = await context!.params!;
  const wantsDownload = new URL(req.url).searchParams.get("download") === "1";

  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      fileUrl: true,
      fileName: true,
      deleted: true,
      uploadedById: true,
      assignedToId: true,
    },
  });
  if (!doc || doc.deleted) throw ApiError.notFound("Document not found");
  if (!doc.fileUrl) throw ApiError.notFound("No file attached");

  const viewerId = session!.user.id;
  const viewerRole = session!.user.role ?? "";

  const canAccess = await canViewStaffDocument(viewerId, viewerRole, {
    uploadedById: doc.uploadedById,
    assignedToId: doc.assignedToId,
  });

  if (!canAccess) {
    logger.warn("Staff document access denied", {
      viewerId,
      viewerRole,
      documentId: doc.id,
    });
    throw ApiError.forbidden();
  }

  return streamStoredFile(doc.fileUrl, {
    fileName: doc.fileName,
    download: wantsDownload,
  });
});
