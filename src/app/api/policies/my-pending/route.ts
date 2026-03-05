import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/policies/my-pending — published policies user hasn't acknowledged at current version
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const userId = session!.user.id;

  // Get all published policies
  const publishedPolicies = await prisma.policy.findMany({
    where: { status: "published", deleted: false },
    orderBy: { updatedAt: "desc" },
  });

  // Get user's acknowledgements
  const userAcks = await prisma.policyAcknowledgement.findMany({
    where: { userId },
    select: { policyId: true, policyVersion: true },
  });

  // Build a set of "policyId:version" for quick lookup
  const ackedSet = new Set(
    userAcks.map((a) => `${a.policyId}:${a.policyVersion}`)
  );

  // Filter to policies not acknowledged at current version
  const pending = publishedPolicies.filter(
    (p) => !ackedSet.has(`${p.id}:${p.version}`)
  );

  return NextResponse.json(pending);
}
