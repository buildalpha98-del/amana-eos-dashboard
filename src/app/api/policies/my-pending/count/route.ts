import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

// GET /api/policies/my-pending/count — `{ count }` of unacknowledged
// current versions for the caller. Powers the nav-sidebar badge; kept
// separate from /my-pending so the badge query stays cheap.
export const GET = withApiAuth(async (req, session) => {
  const userId = session.user.id;

  const docs = await prisma.policyDocument.findMany({
    where: {
      isArchived: false,
      currentVersionId: { not: null },
    },
    select: { currentVersionId: true },
  });

  const currentVersionIds = docs
    .map((d) => d.currentVersionId)
    .filter((id): id is string => !!id);

  if (currentVersionIds.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  const ackedCount = await prisma.policyDocumentAcknowledgement.count({
    where: { userId, versionId: { in: currentVersionIds } },
  });

  return NextResponse.json({ count: currentVersionIds.length - ackedCount });
});
