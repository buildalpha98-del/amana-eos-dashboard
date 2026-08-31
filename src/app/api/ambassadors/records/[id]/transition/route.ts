import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import { assertRecordInScope } from "../../../_lib/scope";
import { transitionAmbassadorRecord } from "@/lib/ambassadors/state-machine";
import { recomputeAmbassadorRecord } from "@/lib/ambassadors/recompute";

/**
 * POST /api/ambassadors/records/[id]/transition — { to, reason? }
 *
 * Who may move a record where (on top of the state machine's own guards):
 * - director_verified: member (their centres) / head_office / admin / owner
 * - sm_approved:       head_office (their centres) / admin / owner
 * - sent_to_payroll:   admin / owner (normally via the payroll export)
 * - paid:              admin / owner
 * - rejected/logged:   anyone who could make the state's forward move
 */

const bodySchema = z.object({
  to: z.enum([
    "logged",
    "director_verified",
    "sm_approved",
    "sent_to_payroll",
    "paid",
    "rejected",
  ]),
  reason: z.string().trim().max(1000).optional(),
});

const TRANSITION_ROLES: Record<string, string[]> = {
  logged: ["owner", "head_office", "admin", "member"],
  director_verified: ["owner", "head_office", "admin", "member"],
  sm_approved: ["owner", "head_office", "admin"],
  sent_to_payroll: ["owner", "admin"],
  paid: ["owner", "admin"],
  rejected: ["owner", "head_office", "admin", "member"],
};

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = (await context?.params) ?? {};
    if (!id) throw ApiError.badRequest("Missing record id");

    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const { to, reason } = parsed.data;

    const role = session.user.role as string;
    if (!TRANSITION_ROLES[to].includes(role)) {
      throw ApiError.forbidden(
        `Your role cannot move a record to ${to.replace(/_/g, " ")}.`,
      );
    }

    const record = await prisma.ambassadorEnrolment.findUnique({
      where: { id },
      select: { id: true, serviceId: true, creditedEducatorId: true },
    });
    if (!record) throw ApiError.notFound("Ambassador record not found");
    const { serviceIds } = await getCentreScope(session);
    assertRecordInScope(record, session, serviceIds);

    // Verification assesses the tier "at the end of the window" — recompute
    // first so the decision is made on current numbers, not stale ones.
    await recomputeAmbassadorRecord(id);

    await transitionAmbassadorRecord({
      recordId: id,
      to,
      actorId: session.user.id,
      reason,
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
