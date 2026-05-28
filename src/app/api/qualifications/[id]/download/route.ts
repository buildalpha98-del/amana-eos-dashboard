import { NextResponse, type NextRequest } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

/**
 * GET /api/qualifications/[id]/download
 *
 * Access-checked redirect to a StaffQualification's certificate blob URL.
 * Used by the staff profile's Certifications sub-tab so the file isn't
 * exposed as a raw blob URL in markup (the previous DocumentsTab + the
 * compliance-cert proxy already did this — qualifications were the
 * outlier).
 *
 * Access matrix (matches compliance/[id]/download):
 *   - Qualification belongs to the viewer (userId === viewer): allowed
 *   - Admin (owner / admin / head_office): allowed
 *   - Coordinator in the same service as the qualification's owner: allowed
 *   - Anyone else: 403
 *
 * Returns 404 if the qualification is missing or has no certificateUrl.
 * `?download=1` forces the browser to treat the response as an attachment
 * (Vercel Blob honours the `download` query param).
 */
export const GET = withApiAuth(async (req: NextRequest, session, context) => {
  const { id } = await context!.params!;
  const wantsDownload = new URL(req.url).searchParams.get("download") === "1";

  const qual = await prisma.staffQualification.findUnique({
    where: { id },
    select: { id: true, userId: true, name: true, certificateUrl: true },
  });
  if (!qual) throw ApiError.notFound("Qualification not found");
  if (!qual.certificateUrl) throw ApiError.notFound("No file attached");

  const viewerId = session!.user.id;
  const viewerRole = session!.user.role ?? "";
  const isOwn = qual.userId === viewerId;
  const isAdmin = isAdminRole(viewerRole);

  let canAccess = isOwn || isAdmin;
  if (!canAccess && viewerRole === "member") {
    const [viewer, owner] = await Promise.all([
      prisma.user.findUnique({
        where: { id: viewerId },
        select: { serviceId: true },
      }),
      prisma.user.findUnique({
        where: { id: qual.userId },
        select: { serviceId: true },
      }),
    ]);
    canAccess =
      !!viewer?.serviceId &&
      !!owner?.serviceId &&
      viewer.serviceId === owner.serviceId;
  }
  if (!canAccess) throw ApiError.forbidden();

  const target = wantsDownload
    ? `${qual.certificateUrl}${qual.certificateUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(qual.name)}`
    : qual.certificateUrl;

  return NextResponse.redirect(target);
});
