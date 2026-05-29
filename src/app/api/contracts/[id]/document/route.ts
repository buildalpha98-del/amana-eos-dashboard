import { NextResponse, type NextRequest } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

/**
 * GET /api/contracts/[id]/document
 *
 * Access-checked redirect to the contract's PDF in blob storage. Used by the
 * staff portal "View Contract" button so the client never sees the raw blob
 * URL — the constraint "staff can only view their own contracts" is enforced
 * here, not by URL secrecy.
 *
 * Access matrix:
 *   - Own contract (contract.userId === viewer): allowed
 *   - Admin role (owner / admin / head_office): allowed
 *   - Anyone else: 403
 *
 * Returns 404 if the contract doesn't exist or has no documentUrl
 * (blank-form contracts without an uploaded PDF).
 *
 * `?download=1` appends Vercel Blob's `download` query so the browser forces
 * `Content-Disposition: attachment` instead of inline view — used by the
 * Download affordance in the file viewer modal.
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

  const target = wantsDownload
    ? `${contract.documentUrl}${contract.documentUrl.includes("?") ? "&" : "?"}download=contract-${contract.id}.pdf`
    : contract.documentUrl;

  return NextResponse.redirect(target);
});
