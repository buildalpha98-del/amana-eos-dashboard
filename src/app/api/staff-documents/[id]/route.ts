import { NextResponse, type NextRequest } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

/**
 * GET /api/staff-documents/[id]
 *
 * Access-checked redirect to a Document's blob URL. Used by the staff profile
 * page's Documents tab so HR docs / personal docs aren't exposed via direct
 * blob URLs in the markup.
 *
 * Access matrix (viewer ↔ document):
 *   - Document uploader OR assignee is the viewer: allowed
 *   - Viewer is an admin (owner / admin / head_office): allowed
 *   - Viewer is in the same service as the document's assignee
 *     (so a service coordinator can review their own staff's docs): allowed
 *   - Anyone else: 403
 *
 * Returns 404 if the document doesn't exist, is soft-deleted, or has no
 * fileUrl. Optional `?download=1` rewrites the redirect target so the browser
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
  const isOwn = doc.uploadedById === viewerId || doc.assignedToId === viewerId;
  const isAdmin = isAdminRole(viewerRole);

  let canAccess = isOwn || isAdmin;

  // Coordinator-in-same-service check: only run when needed (saves a query
  // on the common admin / own-doc paths) and only when the doc has an
  // assignee whose service we can compare against.
  if (!canAccess && doc.assignedToId) {
    const [viewer, assignee] = await Promise.all([
      prisma.user.findUnique({
        where: { id: viewerId },
        select: { serviceId: true },
      }),
      prisma.user.findUnique({
        where: { id: doc.assignedToId },
        select: { serviceId: true },
      }),
    ]);
    canAccess =
      !!viewer?.serviceId &&
      !!assignee?.serviceId &&
      viewer.serviceId === assignee.serviceId;
  }

  if (!canAccess) throw ApiError.forbidden();

  // Vercel Blob URLs accept ?download=<filename> to force attachment delivery.
  // For other storage layers this is a no-op (the query param is ignored).
  const target = wantsDownload
    ? `${doc.fileUrl}${doc.fileUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(doc.fileName)}`
    : doc.fileUrl;

  return NextResponse.redirect(target);
});
