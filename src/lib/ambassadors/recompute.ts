import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  ADJUSTMENT_MILESTONE_KICKER,
  MILESTONE_AMOUNT,
  MILESTONE_THRESHOLD,
  QUALIFYING_PAID_SESSIONS,
} from "./constants";
import {
  deriveFirstAttendance,
  paidSessionsInWindow,
  tierAmountFor,
} from "./qualification";

/**
 * The ONLY writer of the derived fields on AmbassadorEnrolment
 * (firstAttendanceDate, paidSessionsAttended, tierAmount, incentiveAmount,
 * qualified, qualifiedAt) — mirroring the recalcEnrollmentStatus pattern.
 * Call after any change to sessions, sessions-per-week, attribution, or
 * the new-child status.
 *
 * Records already sent to payroll (or paid) are frozen — their numbers are
 * on a payslip; recompute skips them.
 */
export async function recomputeAmbassadorRecord(recordId: string): Promise<void> {
  const record = await prisma.ambassadorEnrolment.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      pilotId: true,
      status: true,
      newChildStatus: true,
      regularSessionsPerWeek: true,
      creditedEducatorId: true,
      attributionConflict: true,
      qualifiedAt: true,
      sessions: { select: { date: true, fee: true } },
    },
  });
  if (!record) return;
  if (record.status === "sent_to_payroll" || record.status === "paid") return;

  const first = deriveFirstAttendance(record.sessions);
  const paid = first ? paidSessionsInWindow(record.sessions, first) : 0;
  const tier = tierAmountFor(record.regularSessionsPerWeek);
  const qualified =
    record.newChildStatus === "new_child" && paid >= QUALIFYING_PAID_SESSIONS;

  const credited =
    record.creditedEducatorId != null && !record.attributionConflict;
  // Qualified + credited → the tier amount (null until sessions/week is
  // set — the state machine blocks verification of a credited record until
  // then). Qualified but unattributed → $0 (counts toward the centre
  // target, no individual payout). Not qualified → $0.
  const incentiveAmount = qualified ? (credited ? tier : 0) : 0;

  await prisma.ambassadorEnrolment.update({
    where: { id: record.id },
    data: {
      firstAttendanceDate: first,
      paidSessionsAttended: paid,
      tierAmount: tier,
      incentiveAmount,
      qualified,
      qualifiedAt: qualified ? (record.qualifiedAt ?? new Date()) : null,
    },
  });

  if (record.creditedEducatorId) {
    await syncMilestoneKicker(record.pilotId, record.creditedEducatorId);
  }
}

/**
 * $100 one-off when an educator reaches 5 qualified enrolments within the
 * pilot. Idempotent via @@unique([pilotId, educatorId, type]). If a later
 * disqualification drops the count below 5, the adjustment is removed —
 * unless it has already gone to payroll, which is flagged for manual
 * follow-up instead.
 */
async function syncMilestoneKicker(
  pilotId: string,
  educatorId: string,
): Promise<void> {
  const qualifiedCount = await prisma.ambassadorEnrolment.count({
    where: { pilotId, creditedEducatorId: educatorId, qualified: true },
  });

  const existing = await prisma.ambassadorAdjustment.findUnique({
    where: {
      pilotId_educatorId_type: {
        pilotId,
        educatorId,
        type: ADJUSTMENT_MILESTONE_KICKER,
      },
    },
    select: { id: true, sentToPayrollAt: true },
  });

  if (qualifiedCount >= MILESTONE_THRESHOLD) {
    if (!existing) {
      await prisma.ambassadorAdjustment.create({
        data: {
          pilotId,
          educatorId,
          type: ADJUSTMENT_MILESTONE_KICKER,
          amount: MILESTONE_AMOUNT,
        },
      });
    }
    return;
  }

  if (existing) {
    if (existing.sentToPayrollAt) {
      logger.warn("Ambassadors: milestone kicker already sent to payroll but educator dropped below threshold", {
        pilotId,
        educatorId,
        qualifiedCount,
      });
      return;
    }
    await prisma.ambassadorAdjustment.delete({ where: { id: existing.id } });
  }
}
