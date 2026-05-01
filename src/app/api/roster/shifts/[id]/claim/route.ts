/**
 * POST /api/roster/shifts/[id]/claim
 *
 * Staff claims an open (unassigned) shift. First-come-first-served.
 * Only the original `userId === null` shifts are claimable.
 *
 * Guards:
 * 1. **Service-scoped** — the claimer must already be assigned to the
 *    shift's service (so an educator at Centre A can't claim a Centre B
 *    open shift unless they're cross-attached).
 * 2. **Cert-expiry** — same `assertStaffCertsValidForShift` from PR #52.
 *    A user with an expired WWCC / first aid / food safety can't claim.
 * 3. **Already-claimed** — second concurrent claimer hits 409. We do
 *    the assignment via a `prisma.rosterShift.updateMany` that filters
 *    on `userId: null` so the database race-condition is settled there
 *    rather than at the application layer.
 *
 * 2026-05-02: introduced as the open-shift offer flow — fourth
 * deliverable of the Connecteam-style roster spec.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { assertStaffCertsValidForShift } from "../../../_lib/cert-guard";

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  if (!id) throw ApiError.badRequest("Missing shift id");

  const shift = await prisma.rosterShift.findUnique({
    where: { id },
    select: {
      id: true,
      serviceId: true,
      userId: true,
      date: true,
      sessionType: true,
      shiftStart: true,
      shiftEnd: true,
    },
  });
  if (!shift) throw ApiError.notFound("Shift not found");

  // Already claimed by someone (or pre-assigned at creation).
  if (shift.userId) {
    throw ApiError.conflict(
      "This shift has already been claimed by another staff member.",
    );
  }

  const role = session.user.role ?? "";
  const callerServiceId =
    (session.user as { serviceId?: string | null }).serviceId ?? null;

  // Service-scoping. Org-wide roles bypass; everyone else must work at
  // this centre. Note: in the current single-service-assignment model
  // this is straightforward; if/when multi-service attachments ship
  // (member at multiple centres) this check should consult that
  // membership table instead.
  if (!isAdminRole(role) && callerServiceId !== shift.serviceId) {
    throw ApiError.forbidden(
      "You can only claim shifts at your assigned service.",
    );
  }

  // Same cert-expiry rule the admin assignment runs (PR #52).
  await assertStaffCertsValidForShift({
    userId: session.user.id,
    shiftDate: shift.date,
  });

  // Look up the claimer's name once for the staffName denormalisation
  // the grid uses.
  const claimer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  });
  if (!claimer) throw ApiError.notFound("User not found");

  // Race-condition-safe claim: updateMany filtered on userId=null so
  // two concurrent POSTs can't both win. The first wins (count=1) and
  // the second sees count=0 → 409.
  const result = await prisma.rosterShift.updateMany({
    where: { id, userId: null },
    data: {
      userId: session.user.id,
      staffName: claimer.name,
    },
  });
  if (result.count === 0) {
    throw ApiError.conflict(
      "This shift was just claimed by another staff member — try the next available one.",
    );
  }

  // Re-fetch the freshly-updated row so the response matches what the
  // grid expects (with the user relation hydrated).
  const updated = await prisma.rosterShift.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });
  return NextResponse.json({ shift: updated });
});
