import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

// POST /api/policies/[id]/acknowledge — current user acknowledges the
// current version of the policy. The unique constraint on
// (versionId, userId) is what prevents duplicate acknowledgements; we catch
// it as a 409 below. Acknowledgements are per-version, so when the admin
// uploads a new PDF the old ack remains but no longer counts.
export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const doc = await prisma.policyDocument.findUnique({
    where: { id },
    select: { id: true, title: true, isArchived: true, currentVersionId: true },
  });
  if (!doc) throw ApiError.notFound("Policy not found");
  if (doc.isArchived) {
    throw ApiError.badRequest("This policy is archived");
  }
  if (!doc.currentVersionId) {
    throw ApiError.badRequest("This policy has no current version to acknowledge");
  }

  const versionId = doc.currentVersionId;

  const existing = await prisma.policyDocumentAcknowledgement.findUnique({
    where: { versionId_userId: { versionId, userId: session.user.id } },
    select: { id: true, acknowledgedAt: true },
  });

  if (existing) {
    return NextResponse.json(
      {
        id: existing.id,
        acknowledgedAt: existing.acknowledgedAt,
        alreadyAcknowledged: true,
      },
      { status: 200 },
    );
  }

  const ack = await prisma.policyDocumentAcknowledgement.create({
    data: { versionId, userId: session.user.id },
  });

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "acknowledge",
      entityType: "PolicyDocument",
      entityId: id,
      details: { title: doc.title, versionId },
    },
  });

  return NextResponse.json(ack, { status: 201 });
});
