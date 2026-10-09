import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { z } from "zod";
import { assertStaffCertsValidForShift } from "../../_lib/cert-guard";
import { assertUserCleared } from "@/lib/induction";
import { notifyUsers } from "@/lib/notify-user";
import { shiftLabel } from "@/lib/roster-staff";
import { requireRoomId } from "@/lib/room-resolver";

// ---------------------------------------------------------------------------
// Partial-update schema mirrors the create schema but every field optional.
// ---------------------------------------------------------------------------

const patchShiftSchema = z
  .object({
    serviceId: z.string().min(1),
    // null = unassign → open shift (any qualified staff can claim it).
    userId: z.string().min(1).nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sessionType: z.enum(["bsc", "asc", "vc"]),
    shiftStart: z.string().regex(/^\d{2}:\d{2}$/),
    shiftEnd: z.string().regex(/^\d{2}:\d{2}$/),
    role: z.string().nullish(),
    status: z.enum(["draft", "published"]),
  })
  .partial();

// ---------------------------------------------------------------------------
// PATCH /api/roster/shifts/[id]
// ---------------------------------------------------------------------------

/** Date, times, centre or person changed → the stamp no longer applies. */
function changesWhatTheyAgreedTo(
  existing: { date: Date; shiftStart: string; shiftEnd: string; serviceId: string; userId: string | null },
  data: { date?: string; shiftStart?: string; shiftEnd?: string; serviceId?: string; userId?: string | null },
): boolean {
  return (
    (data.date !== undefined && new Date(data.date).getTime() !== existing.date.getTime()) ||
    (data.shiftStart !== undefined && data.shiftStart !== existing.shiftStart) ||
    (data.shiftEnd !== undefined && data.shiftEnd !== existing.shiftEnd) ||
    (data.serviceId !== undefined && data.serviceId !== existing.serviceId) ||
    (data.userId !== undefined && data.userId !== existing.userId)
  );
}

export const PATCH = withApiAuth(async (req, session, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) throw ApiError.badRequest("Missing shift id");

  const body = await parseJsonBody(req);
  const parsed = patchShiftSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }
  const data = parsed.data;

  const existing = await prisma.rosterShift.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Shift not found");

  const role = session.user.role ?? "";
  const targetServiceId = data.serviceId ?? existing.serviceId;
  if (!isAdminRole(role)) {
    if (role !== "member") throw ApiError.forbidden();
    // Coordinators must own BOTH the existing and the proposed service.
    if (
      session.user.serviceId !== existing.serviceId ||
      session.user.serviceId !== targetServiceId
    ) {
      throw ApiError.forbidden();
    }
  }

  // Validate time window if both ends supplied or one changes.
  const nextStart = data.shiftStart ?? existing.shiftStart;
  const nextEnd = data.shiftEnd ?? existing.shiftEnd;
  if (nextStart >= nextEnd) {
    throw ApiError.badRequest("shiftEnd must be later than shiftStart");
  }

  // If userId changes, re-hydrate staffName from the new user. Unassigning
  // (explicit null) resets staffName to the "Open shift" literal so the row
  // stays internally consistent with open shifts created via POST.
  let staffNameUpdate: string | undefined;
  if (data.userId && data.userId !== existing.userId) {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { name: true },
    });
    if (!user) throw ApiError.notFound("User not found");
    staffNameUpdate = user.name;
  } else if (data.userId === null && existing.userId !== null) {
    staffNameUpdate = "Open shift";
  }

  // 2026-05-02: re-validate compliance certs whenever the assignee or the
  // shift date changes (a re-assignment to someone with an expired cert
  // is exactly the slip we're guarding against). For a pure time-shift
  // edit (e.g. shiftStart only) we don't re-check; the original
  // assignment was already validated at create-time.
  // `!== undefined` (not `??`): an explicit null means the shift is being
  // unassigned, so the post-write assignee is nobody — don't cert-check the
  // outgoing user on a simultaneous date change.
  const newUserId = data.userId !== undefined ? data.userId : existing.userId;
  const newDate = data.date ? new Date(data.date) : existing.date;
  const userOrDateChanged =
    (data.userId && data.userId !== existing.userId) ||
    (data.date && newDate.getTime() !== existing.date.getTime());
  if (newUserId && userOrDateChanged) {
    await assertStaffCertsValidForShift({ userId: newUserId, shiftDate: newDate });
  }
  // Induction gate: reassigning a shift to an un-cleared user is blocked.
  if (data.userId) {
    await assertUserCleared(data.userId);
  }

  /**
   * Stage 1 dual key on the one update path that can MOVE a shift.
   *
   * Either half of the pair can change here — a shift can be reassigned
   * to a different slot, or to a different centre — so the room has to
   * be re-resolved against whichever values will be in force after the
   * write, not the ones sent. Recomputing only when `sessionType` is in
   * the payload would leave a shift moved between centres pointing at
   * the old centre's room.
   */
  const movesRoom =
    data.sessionType !== undefined || data.serviceId !== undefined;
  const roomUpdate = movesRoom
    ? {
        roomId: await requireRoomId(
          data.serviceId ?? existing.serviceId,
          data.sessionType ?? existing.sessionType,
        ),
      }
    : {};

  try {
    const shift = await prisma.rosterShift.update({
      where: { id },
      data: {
        ...roomUpdate,
        ...(data.serviceId !== undefined && { serviceId: data.serviceId }),
        ...(data.userId !== undefined && { userId: data.userId }),
        ...(staffNameUpdate !== undefined && { staffName: staffNameUpdate }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
        ...(data.sessionType !== undefined && { sessionType: data.sessionType }),
        ...(data.shiftStart !== undefined && { shiftStart: data.shiftStart }),
        ...(data.shiftEnd !== undefined && { shiftEnd: data.shiftEnd }),
        ...(data.role !== undefined && { role: data.role ?? null }),
        ...(data.status !== undefined && { status: data.status }),
        // A changed shift has to be seen again (2026-10-09).
        ...(changesWhatTheyAgreedTo(existing, data) && { acknowledgedAt: null }),
      },
    });

    // An open shift given to someone: clear the hands-up list and tell
    // everyone who asked (2026-10-09).
    if (existing.userId === null && data.userId) {
      const asked = await prisma.shiftInterest.findMany({
        where: { shiftId: id },
        select: { userId: true },
      });
      await prisma.shiftInterest.deleteMany({ where: { shiftId: id } });
      const label = shiftLabel(shift.date, shift.shiftStart, shift.shiftEnd);
      notifyUsers(prisma, [data.userId], {
        type: "roster",
        title: "You've got the open shift",
        body: label,
        link: "/my-day",
      }).catch(() => {});
      const others = asked.map((a) => a.userId).filter((u) => u !== data.userId);
      if (others.length) {
        notifyUsers(prisma, others, {
          type: "roster",
          title: "That open shift has been filled",
          body: `${label} went to someone else this time. Thanks for putting your hand up.`,
          link: "/my-day",
        }).catch(() => {});
      }
    }
    return NextResponse.json({ shift });
  } catch (err) {
    // @@unique([serviceId, date, staffName, shiftStart]) — unassigning (or
    // moving) a shift can collide with another "Open shift" row at the same
    // start time. Surface as a friendly 409 instead of a P2002 500.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      throw ApiError.conflict(
        "This staff member already has a shift starting at this time.",
      );
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/roster/shifts/[id]
// Blocks delete if a swap is pending (proposed/accepted).
// ---------------------------------------------------------------------------

export const DELETE = withApiAuth(async (_req, session, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) throw ApiError.badRequest("Missing shift id");

  const existing = await prisma.rosterShift.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Shift not found");

  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    if (role !== "member" || session.user.serviceId !== existing.serviceId) {
      throw ApiError.forbidden();
    }
  }

  const pendingSwap = await prisma.shiftSwapRequest.findFirst({
    where: { shiftId: id, status: { in: ["proposed", "accepted"] } },
  });
  if (pendingSwap) {
    throw ApiError.conflict("Cannot delete shift with pending swap request");
  }

  await prisma.rosterShift.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
