import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/hr/policies
 * Create or update policies and check acknowledgement status.
 * Used by: hr-policy-update-tracker, hr-staff-handbook-updater
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create_policy") {
      const { title, description, category, version, requiresReack } = body;

      if (!title) {
        return NextResponse.json(
          { error: "Bad Request", message: "title required" },
          { status: 400 }
        );
      }

      const existing = await prisma.policy.findFirst({
        where: { title, deleted: false },
      });

      let policy;
      if (existing) {
        policy = await prisma.policy.update({
          where: { id: existing.id },
          data: {
            description: description || existing.description,
            category: category || existing.category,
            version: version || existing.version + 1,
            status: "published",
            publishedAt: new Date(),
            requiresReack: requiresReack ?? true,
          },
        });
      } else {
        policy = await prisma.policy.create({
          data: {
            title,
            description: description || null,
            category: category || "general",
            version: version || 1,
            status: "published",
            publishedAt: new Date(),
            requiresReack: requiresReack ?? true,
          },
        });
      }

      return NextResponse.json(
        {
          message: "Policy created/updated",
          policyId: policy.id,
          title: policy.title,
          version: policy.version,
        },
        { status: 201 }
      );
    }

    if (action === "check_acknowledgements") {
      const policies = await prisma.policy.findMany({
        where: { status: "published", deleted: false, requiresReack: true },
        include: {
          acknowledgements: { select: { userId: true, policyVersion: true } },
        },
      });

      const users = await prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true, email: true },
      });

      const pending = [];
      for (const policy of policies) {
        const ackedUserIds = policy.acknowledgements
          .filter((a) => a.policyVersion === policy.version)
          .map((a) => a.userId);

        const unacked = users.filter((u) => !ackedUserIds.includes(u.id));
        if (unacked.length > 0) {
          pending.push({
            policyId: policy.id,
            title: policy.title,
            version: policy.version,
            unacknowledgedStaff: unacked,
          });
        }
      }

      return NextResponse.json({ pending, totalPolicies: policies.length });
    }

    return NextResponse.json(
      {
        error: "Bad Request",
        message: "action must be create_policy or check_acknowledgements",
      },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /cowork/hr/policies]", err);
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
}
