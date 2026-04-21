import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

/**
 * GET /api/compliance/[id]/download
 *
 * Access-checked redirect to the cert's blob URL. Access matrix:
 *   - Own cert (userId matches viewer): allowed
 *   - Admin role (owner/head_office/admin): allowed
 *   - Coordinator whose service matches the cert's service: allowed
 *   - Anyone else: 403
 *
 * Returns 404 if the cert is missing or has no attached file.
 */
export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;

  const cert = await prisma.complianceCertificate.findUnique({
    where: { id },
    select: { id: true, userId: true, serviceId: true, fileUrl: true },
  });
  if (!cert) throw ApiError.notFound("Certificate not found");
  if (!cert.fileUrl) throw ApiError.notFound("No file attached");

  const viewerId = session.user.id;
  const viewerRole = session.user.role ?? "";
  const isOwn = cert.userId === viewerId;
  const isAdmin = isAdminRole(viewerRole);

  let canAccess = isOwn || isAdmin;
  if (!canAccess && viewerRole === "coordinator") {
    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { serviceId: true },
    });
    canAccess = !!viewer?.serviceId && viewer.serviceId === cert.serviceId;
  }

  if (!canAccess) throw ApiError.forbidden();

  return NextResponse.redirect(cert.fileUrl);
});
