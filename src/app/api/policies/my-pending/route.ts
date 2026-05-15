import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

// GET /api/policies/my-pending — non-archived policy documents that have
// a current version the caller has not yet acknowledged. Marketing role
// is excluded from the pending feed (they can view & ack via the page,
// but acknowledgement isn't part of their workflow).
export const GET = withApiAuth(async (req, session) => {
  const userId = session.user.id;

  const docs = await prisma.policyDocument.findMany({
    where: {
      isArchived: false,
      currentVersionId: { not: null },
    },
    include: {
      currentVersion: {
        select: {
          id: true,
          versionNumber: true,
          fileName: true,
          uploadedAt: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const currentVersionIds = docs
    .map((d) => d.currentVersionId)
    .filter((id): id is string => !!id);

  const ackedVersionIds = currentVersionIds.length
    ? new Set(
        (
          await prisma.policyDocumentAcknowledgement.findMany({
            where: { userId, versionId: { in: currentVersionIds } },
            select: { versionId: true },
          })
        ).map((a) => a.versionId),
      )
    : new Set<string>();

  const pending = docs.filter(
    (d) => d.currentVersionId && !ackedVersionIds.has(d.currentVersionId),
  );

  return NextResponse.json(pending);
});
