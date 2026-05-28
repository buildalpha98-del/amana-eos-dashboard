import { NextResponse } from "next/server";
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
 */
export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;

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

  return NextResponse.redirect(contract.documentUrl);
});
