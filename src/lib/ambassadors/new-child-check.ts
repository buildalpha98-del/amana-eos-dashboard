import { prisma } from "@/lib/prisma";
import type { AmbassadorNewChildStatus } from "@prisma/client";
import { NEW_CHILD_LOOKBACK_MONTHS } from "./constants";

/**
 * 6-month "new child" heuristic (policy signed off 2026-08-03).
 *
 * There is no cross-centre child identity key, so we match by name + DOB
 * across ALL Child rows and look for enrolment signals inside the prior
 * 6 months. Ambiguous matches come back `uncertain` and BLOCK qualification
 * until a Director attests either way — a false "new" here pays an
 * incentive for a non-new child.
 */

export interface NewChildCheckInput {
  firstName: string;
  surname: string;
  dob: Date | null;
  /** The just-created Child row(s) for this enrolment — never self-matches. */
  excludeChildIds: string[];
  /** Anchor for the 6-month lookback (the submission date). */
  enrolmentDate: Date;
}

export interface NewChildCheckResult {
  status: AmbassadorNewChildStatus;
  detail: string;
}

function sameUtcDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export async function checkNewChild(
  input: NewChildCheckInput,
): Promise<NewChildCheckResult> {
  const candidates = await prisma.child.findMany({
    where: {
      id: { notIn: input.excludeChildIds },
      firstName: { equals: input.firstName.trim(), mode: "insensitive" },
      surname: { equals: input.surname.trim(), mode: "insensitive" },
    },
    select: { id: true, dob: true, status: true },
  });

  if (candidates.length === 0) {
    return {
      status: "new_child",
      detail: "No other child record with this name exists at any Amana centre.",
    };
  }

  // DOB partitions name-matches into: confirmed matches (same DOB),
  // non-matches (different DOB), and ambiguous (either side missing DOB).
  const confirmed: typeof candidates = [];
  let ambiguous = 0;
  for (const c of candidates) {
    if (input.dob && c.dob) {
      if (sameUtcDate(input.dob, c.dob)) confirmed.push(c);
    } else {
      ambiguous++;
    }
  }

  if (confirmed.length === 0 && ambiguous === 0) {
    return {
      status: "new_child",
      detail:
        "A child with the same name exists but has a different date of birth — treated as a different child.",
    };
  }

  if (confirmed.length === 0) {
    return {
      status: "uncertain",
      detail: `${ambiguous} existing child record(s) share this name but a date of birth is missing on one side — Director to confirm whether this is the same child.`,
    };
  }

  const windowStart = new Date(input.enrolmentDate);
  windowStart.setUTCMonth(windowStart.getUTCMonth() - NEW_CHILD_LOOKBACK_MONTHS);
  const confirmedIds = confirmed.map((c) => c.id);

  if (confirmed.some((c) => c.status === "active" || c.status === "pending")) {
    return {
      status: "existing_child",
      detail:
        "This child already has an active or pending enrolment at an Amana centre.",
    };
  }

  const [recentAttendance, recentBookings] = await Promise.all([
    prisma.attendanceRecord.count({
      where: {
        childId: { in: confirmedIds },
        date: { gte: windowStart, lte: input.enrolmentDate },
      },
    }),
    prisma.booking.count({
      where: {
        childId: { in: confirmedIds },
        date: { gte: windowStart, lte: input.enrolmentDate },
      },
    }),
  ]);

  if (recentAttendance > 0 || recentBookings > 0) {
    return {
      status: "existing_child",
      detail: `This child attended or was booked at an Amana centre within the past ${NEW_CHILD_LOOKBACK_MONTHS} months.`,
    };
  }

  return {
    status: "new_child",
    detail: `A withdrawn record for this child exists but shows no attendance or bookings in the past ${NEW_CHILD_LOOKBACK_MONTHS} months — a returning family counts as new.`,
  };
}
