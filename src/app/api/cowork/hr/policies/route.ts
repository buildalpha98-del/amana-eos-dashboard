import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
const createPolicySchema = z.object({
  action: z.literal("create_policy"),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().optional(),
  version: z.number().optional(),
  requiresReack: z.boolean().optional(),
});

const checkAcknowledgementsSchema = z.object({
  action: z.literal("check_acknowledgements"),
});

const bodySchema = z.discriminatedUnion("action", [
  createPolicySchema,
  checkAcknowledgementsSchema,
]);

/**
 * POST /api/cowork/hr/policies
 * Create or update policies and check acknowledgement status.
 * Used by: hr-policy-update-tracker, hr-staff-handbook-updater
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    if (parsed.data.action === "create_policy") {
      const { title, description, category, version, requiresReack } = parsed.data;

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

    if (parsed.data.action === "check_acknowledgements") {
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

    // Unreachable due to discriminated union validation, but keep for safety
    return NextResponse.json(
      {
        error: "Bad Request",
        message: "action must be create_policy or check_acknowledgements",
      },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("POST /cowork/hr/policies", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});
