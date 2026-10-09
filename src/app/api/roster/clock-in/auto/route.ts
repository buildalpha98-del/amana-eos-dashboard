/**
 * POST /api/roster/clock-in/auto
 *
 * "Just clock me in" — server picks the eligible shift in the ±2h
 * window around the user's scheduled `shiftStart`. The MyClockCard
 * widget hits this when the staff taps the primary button without
 * selecting a specific shift.
 *
 * Returns:
 *  - 200 { shift } on a unique match (clocked in, `actualStart` set)
 *  - 200 { ambiguous: true, candidates: [...] } when the user has
 *    multiple eligible shifts (e.g. BSC and ASC same day, both
 *    within window) — the UI then shows a picker
 *  - 404 { hint: "unscheduled" } when there's no eligible shift —
 *    caller can fall through to /api/roster/unscheduled-clock-in
 *
 * 2026-05-04: timeclock v1, sub-PR 2.
 */

import { serviceDateOnly } from "@/lib/timezone";
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { pickEligibleShift } from "@/lib/timeclock-pick";
import { assertUserCleared } from "@/lib/induction";
import { assertPhoneClockInAllowed } from "@/lib/phone-clock-in";

export const POST = withApiAuth(async (_req, session) => {
  const userId = session.user.id;
  // Induction gate: an un-cleared new starter cannot clock in.
  await assertUserCleared(userId);
  const now = new Date();

  // Pull the user's shifts on the day +/- 1 day either side; the ±2h
  // window can straddle midnight so we need yesterday + today + tomorrow
  // in the worst case (e.g. a 23:00-01:00 shift).
  // Roster dates are the centre's (Sydney) calendar days.
  const earliest = serviceDateOnly(now, -1);
  const latest = serviceDateOnly(now, 2);

  const candidates = await prisma.rosterShift.findMany({
    where: {
      userId,
      date: { gte: earliest, lt: latest },
    },
    select: {
      id: true,
      serviceId: true,
      date: true,
      shiftStart: true,
      shiftEnd: true,
      actualStart: true,
      actualEnd: true,
    },
  });

  const result = pickEligibleShift(candidates, now, "in");

  if (result.kind === "ambiguous") {
    return NextResponse.json({ ambiguous: true, candidates: result.candidates });
  }
  if (result.kind === "none") {
    return NextResponse.json(
      {
        error: "No scheduled shift to clock in to.",
        hint: "unscheduled",
      },
      { status: 404 },
    );
  }

  await assertPhoneClockInAllowed(
    candidates.find((c) => c.id === result.shift.id)?.serviceId,
  );

  // Match — clock in.
  const updated = await prisma.rosterShift.update({
    where: { id: result.shift.id },
    data: { actualStart: now },
  });
  return NextResponse.json({ shift: updated });
});
