import { type NextRequest } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { streamStoredFile } from "@/lib/blob-proxy";
import { canAccessStaffProfile, canViewServiceRecords } from "@/lib/staff-access";

/**
 * GET /api/compliance/[id]/download
 *
 * Access-checked stream of the cert out of blob storage. *
 * 2026-09-15: streams the bytes back over our own origin instead of
 * redirecting to blob storage — a cross-origin redirect is unrenderable in
 * the in-app file viewer, because the app's CSP sets no frame-src and so
 * falls back to `default-src 'self'`. See src/lib/blob-proxy.ts.
 *
 * Access matrix:
 *   - Own cert (userId matches viewer): allowed
 *   - Admin role (owner/head_office/admin): allowed
 *   - Coordinator whose service matches the cert's service: allowed
 *   - Anyone else: 403
 *
 * Returns 404 if the cert is missing or has no attached file.
 *
 * `?download=1` appends Vercel Blob's `download` query parameter so the
 * browser forces an attachment (`Content-Disposition: attachment`) instead
 * of inline display — needed so the new "Download" affordance in
 * ComplianceTab is distinct from the inline "View" affordance.
 */
export const GET = withApiAuth(async (req: NextRequest, session, context) => {
  const { id } = await context!.params!;
  const wantsDownload = new URL(req.url).searchParams.get("download") === "1";

  const cert = await prisma.complianceCertificate.findUnique({
    where: { id },
    select: { id: true, userId: true, serviceId: true, fileUrl: true, fileName: true, type: true },
  });
  if (!cert) throw ApiError.notFound("Certificate not found");
  if (!cert.fileUrl) throw ApiError.notFound("No file attached");

  const viewerId = session.user.id;
  const viewerRole = session.user.role ?? "";
  const isOwn = cert.userId === viewerId;
  const isAdmin = isAdminRole(viewerRole);

  let canAccess = isOwn || isAdmin;
  if (!canAccess && viewerRole === "member") {
    if (cert.userId) {
      // A personal certificate (WWCC, first aid…) usually has NO serviceId,
      // so the old "cert.serviceId === my centre" check locked Directors out
      // of their own staff's files. Same rule as the staff profile: they can
      // see it when they share a centre with its owner (2026-10-08 — the
      // service Documents tab, for regulator spot checks).
      const owner = await prisma.user.findUnique({
        where: { id: cert.userId },
        select: { id: true, serviceId: true },
      });
      canAccess = !!owner && (await canAccessStaffProfile(viewerId, viewerRole, owner));
    }
    // A certificate filed under the Director's own centre stays visible too
    // (the original rule — kept so nothing that opened before stops opening).
    if (!canAccess && cert.serviceId) {
      canAccess = await canViewServiceRecords(viewerId, viewerRole, cert.serviceId);
    }
  }

  if (!canAccess) throw ApiError.forbidden();

  return streamStoredFile(cert.fileUrl, {
    fileName: cert.fileName ?? `${cert.type}-certificate`,
    download: wantsDownload,
  });
});
