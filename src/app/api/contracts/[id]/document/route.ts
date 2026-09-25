import { type NextRequest } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { streamStoredFile } from "@/lib/blob-proxy";

/**
 * GET /api/contracts/[id]/document
 *
 * Access-checked STREAM of the contract's PDF out of blob storage. Used by
 * the staff portal "View Contract" button so the client never sees the raw
 * blob URL — the constraint "staff can only view their own contracts" is
 * enforced here, not by URL secrecy.
 *
 * 2026-09-15: this used to redirect to the blob URL, which the in-app viewer
 * could not render — CSP has no frame-src, so `default-src 'self'` blocked
 * the cross-origin hop and staff saw an error where their contract should
 * be. Opening the same link in a new tab worked, because a top-level
 * navigation isn't subject to frame-src. See src/lib/blob-proxy.ts.
 *
 * Access matrix:
 *   - Own contract (contract.userId === viewer): allowed
 *   - Admin role (owner / admin / head_office): allowed
 *   - Anyone else: 403
 *
 * Returns 404 if the contract doesn't exist or has no documentUrl
 * (blank-form contracts without an uploaded PDF).
 *
 * `?download=1` answers with `Content-Disposition: attachment` instead of
 * inline view — used by the Download affordance in the file viewer modal.
 */
export const GET = withApiAuth(async (req: NextRequest, session, context) => {
  const { id } = await context!.params!;
  const wantsDownload = new URL(req.url).searchParams.get("download") === "1";

  const contract = await prisma.employmentContract.findUnique({
    where: { id },
    select: { id: true, userId: true, documentUrl: true },
  });
  if (!contract) throw ApiError.notFound("Contract not found");
  if (!contract.documentUrl) throw ApiError.notFound("No document attached");

  const viewerId = session!.user.id;
  const viewerRole = session!.user.role ?? "";
  const isOwn = contract.userId === viewerId;
  const isAdmin = isAdminRole(viewerRole);

  if (!isOwn && !isAdmin) throw ApiError.forbidden();

  return streamStoredFile(contract.documentUrl, {
    fileName: `contract-${contract.id}.pdf`,
    download: wantsDownload,
    fallbackContentType: "application/pdf",
  });
});
