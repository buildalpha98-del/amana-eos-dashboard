import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// GET /api/policies/compliance — compliance dashboard (owner/admin only)
export const GET = withApiAuth(async (req, session) => {
  const totalStaff = await prisma.user.count({
    where: { active: true },
  });

  const policies = await prisma.policy.findMany({
    where: { status: "published", deleted: false },
    select: {
      id: true,
      title: true,
      version: true,
      category: true,
      publishedAt: true,
    },
    orderBy: { title: "asc" },
  });

  // Get acknowledgement counts per policy at current version
  const results = await Promise.all(
    policies.map(async (policy) => {
      const acknowledgedCount = await prisma.policyAcknowledgement.count({
        where: {
          policyId: policy.id,
          policyVersion: policy.version,
        },
      });

      const pendingCount = totalStaff - acknowledgedCount;
      const complianceRate =
        totalStaff > 0
          ? Math.round((acknowledgedCount / totalStaff) * 100)
          : 0;

      return {
        id: policy.id,
        title: policy.title,
        version: policy.version,
        category: policy.category,
        publishedAt: policy.publishedAt,
        totalStaff,
        acknowledgedCount,
        pendingCount,
        complianceRate,
      };
    })
  );

  return NextResponse.json(results);
}, { roles: ["owner", "head_office", "admin"] });
