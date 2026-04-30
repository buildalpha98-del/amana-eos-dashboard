import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const patchSchema = z.object({
  status: z.enum(["pending", "hired", "bonus_paid", "expired"]).optional(),
  bonusAmount: z.number().min(0).optional(),
  bonusPaidAt: z.string().datetime().nullable().optional(),
});

// PATCH /api/staff-referrals/[id] — update status/bonus (owner/head_office/admin only)
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const body = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }

    const existing = await prisma.staffReferral.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Referral not found");

    if (
      parsed.data.status === "bonus_paid" &&
      existing.status !== "pending" &&
      existing.status !== "hired"
    ) {
      throw ApiError.badRequest(
        `Cannot mark as paid from status '${existing.status}'`,
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.bonusAmount !== undefined)
      data.bonusAmount = parsed.data.bonusAmount;
    if (parsed.data.status === "bonus_paid") {
      data.bonusPaidAt = parsed.data.bonusPaidAt
        ? new Date(parsed.data.bonusPaidAt)
        : new Date();
    }

    const updated = await prisma.staffReferral.update({
      where: { id },
      data,
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: parsed.data.status === "bonus_paid" ? "pay_bonus" : "update",
        entityType: "StaffReferral",
        entityId: id,
        details: {
          status: updated.status,
          bonusAmount: updated.bonusAmount,
        },
      },
    });

    return NextResponse.json(updated);
  },
  { feature: "recruitment.candidates.manage" },
);
