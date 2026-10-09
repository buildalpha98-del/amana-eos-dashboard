/**
 * Clock a staff member in or out of their rostered shift, for the centre's
 * Attendances → Staff screen (2026-10-09). Same rules as the staff kiosk
 * (src/app/api/kiosk/clock): the shared ±2h shift pick (timeclock-pick) and
 * the induction gate on clock-in (assertUserCleared).
 */
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { assertUserCleared } from "@/lib/induction";
import { pickEligibleShift } from "@/lib/timeclock-pick";
import { serviceDateOnly } from "@/lib/timezone";

export type ClockOutcome =
  | { kind: "ok"; shift: { id: string; actualStart: Date | null; actualEnd: Date | null } }
  | { kind: "ambiguous"; candidates: { id: string; shiftStart: string; shiftEnd: string }[] }
  | { kind: "none"; message: string };

export async function clockShift(
  userId: string,
  action: "in" | "out",
  now: Date = new Date(),
  opts: { shiftId?: string } = {},
): Promise<ClockOutcome> {
  if (action === "in") await assertUserCleared(userId);

  const candidates = await prisma.rosterShift.findMany({
    where: {
      userId,
      date: { gte: serviceDateOnly(now, -1), lt: serviceDateOnly(now, 2) },
      ...(opts.shiftId ? { id: opts.shiftId } : {}),
    },
    select: { id: true, date: true, shiftStart: true, shiftEnd: true, actualStart: true, actualEnd: true },
  });
  const result = pickEligibleShift(candidates, now, action);
  if (result.kind === "ambiguous") {
    return {
      kind: "ambiguous",
      candidates: result.candidates.map((c) => ({ id: c.id, shiftStart: c.shiftStart, shiftEnd: c.shiftEnd })),
    };
  }
  if (result.kind === "none") {
    return {
      kind: "none",
      message:
        action === "in"
          ? "No rostered shift to clock in to right now. Ask your Coordinator to add you to today's roster."
          : "No shift you're clocked in to.",
    };
  }
  const shift = await prisma.rosterShift.update({
    where: { id: result.shift.id },
    data: action === "in" ? { actualStart: result.shift.actualStart ?? now } : { actualEnd: result.shift.actualEnd ?? now },
    select: { id: true, actualStart: true, actualEnd: true },
  });
  return { kind: "ok", shift };
}

/** For routes that hand-roll JSON: the induction refusal, worded for the floor. */
export function clockRefusal(e: unknown): string {
  return e instanceof ApiError ? `Can't clock in — ${e.message}` : "Can't clock in — induction incomplete.";
}
