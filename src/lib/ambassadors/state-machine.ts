import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import type { AmbassadorRecordStatus } from "@prisma/client";
import { hasCompletedAmbassadorsCourse } from "./lms-gate";

/**
 * Ambassador record state machine:
 *
 *   logged → director_verified → sm_approved → sent_to_payroll → paid
 *
 * plus `rejected` (with a mandatory reason) from any pre-payroll state and
 * reopening (`rejected → logged`). Backward steps exist so an approval can
 * be unwound BEFORE money moves; nothing moves backward once sent to
 * payroll. Every transition writes an AmbassadorTransition audit row.
 */

const TRANSITIONS: Record<AmbassadorRecordStatus, AmbassadorRecordStatus[]> = {
  logged: ["director_verified", "rejected"],
  director_verified: ["sm_approved", "logged", "rejected"],
  sm_approved: ["sent_to_payroll", "director_verified", "rejected"],
  sent_to_payroll: ["paid"],
  paid: [],
  rejected: ["logged"],
};

export function canTransition(
  from: AmbassadorRecordStatus,
  to: AmbassadorRecordStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export async function transitionAmbassadorRecord(input: {
  recordId: string;
  to: AmbassadorRecordStatus;
  actorId: string | null;
  reason?: string | null;
}): Promise<void> {
  const { recordId, to, actorId } = input;
  const reason = input.reason?.trim() || null;

  const record = await prisma.ambassadorEnrolment.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      status: true,
      qualified: true,
      attributionConflict: true,
      creditedEducatorId: true,
      creditedEducator: { select: { name: true } },
      regularSessionsPerWeek: true,
      incentiveAmount: true,
    },
  });
  if (!record) throw ApiError.notFound("Ambassador record not found");

  if (!canTransition(record.status, to)) {
    throw ApiError.badRequest(
      `Cannot move this record from ${record.status} to ${to}.`,
    );
  }

  if (to === "rejected" && !reason) {
    throw ApiError.badRequest("A reason is required to reject a record.");
  }

  if (to === "director_verified") {
    if (record.attributionConflict) {
      throw ApiError.badRequest(
        "Resolve the attribution conflict before verifying — the ref code and the named educator point to different people.",
      );
    }
    if (record.creditedEducatorId && record.regularSessionsPerWeek == null) {
      throw ApiError.badRequest(
        "Set regular sessions per week before verifying — the incentive tier can't be assessed without it.",
      );
    }
  }

  if (to === "sm_approved" && !record.qualified) {
    throw ApiError.badRequest(
      "This record is not qualified — a qualified enrolment needs a confirmed new child and at least 4 paid sessions within 28 days of first attendance.",
    );
  }

  if (
    to === "sent_to_payroll" &&
    record.creditedEducatorId &&
    (record.incentiveAmount ?? 0) > 0
  ) {
    const completed = await hasCompletedAmbassadorsCourse(
      record.creditedEducatorId,
    );
    if (!completed) {
      throw ApiError.badRequest(
        `${record.creditedEducator?.name ?? "This educator"} has not completed the Amana Ambassadors course — incentive cannot be sent to payroll.`,
      );
    }
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.ambassadorEnrolment.update({
      where: { id: record.id },
      data: {
        status: to,
        rejectionReason: to === "rejected" ? reason : null,
        sentToPayrollAt: to === "sent_to_payroll" ? now : undefined,
        paidAt: to === "paid" ? now : undefined,
      },
    }),
    prisma.ambassadorTransition.create({
      data: {
        recordId: record.id,
        fromStatus: record.status,
        toStatus: to,
        actorId,
        reason,
      },
    }),
  ]);
}
