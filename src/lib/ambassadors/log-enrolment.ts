import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { resolveAttribution } from "./attribution";
import { checkNewChild } from "./new-child-check";
import { recomputeAmbassadorRecord } from "./recompute";

/**
 * Auto-creates ambassador records when an enrolment lands at a pilot centre
 * during the pilot window. Called AFTER the enrolment transaction commits,
 * from:
 *  - the parent enrolment submit route (per child),
 *  - the enrolment-application approve route (sibling flow), and
 *  - the assign-service / backfill-service routes (children whose school
 *    didn't auto-match at submit time and gained a serviceId later).
 *
 * NOTHING here may break enrolment: every entry point swallows and logs.
 * Idempotent per child (one ambassador record per Child row, ever).
 */

function initialsOf(firstName: string | null, surname: string | null): string {
  const f = firstName?.trim()?.[0]?.toUpperCase();
  const s = surname?.trim()?.[0]?.toUpperCase();
  return [f, s].filter(Boolean).map((c) => `${c}.`).join("") || "?.";
}

async function activePilotCentre(
  serviceId: string,
  onDate: Date,
): Promise<{ pilotId: string } | null> {
  const centre = await prisma.ambassadorPilotCentre.findFirst({
    where: {
      serviceId,
      pilot: {
        status: "active",
        startDate: { lte: onDate },
        endDate: { gte: onDate },
      },
    },
    select: { pilotId: true },
  });
  return centre;
}

interface ChildForLogging {
  id: string;
  firstName: string;
  surname: string;
  dob: Date | null;
  serviceId: string | null;
}

async function createRecordForChild(input: {
  child: ChildForLogging;
  enrolmentDate: Date;
  refCode: string | null;
  namedEducatorText: string | null;
  enrolmentSubmissionId?: string;
  enrolmentApplicationId?: string;
}): Promise<void> {
  const { child } = input;
  if (!child.serviceId) return;

  const centre = await activePilotCentre(child.serviceId, input.enrolmentDate);
  if (!centre) return;

  // One ambassador record per child, ever — re-approval or service
  // reassignment must not duplicate.
  const existing = await prisma.ambassadorEnrolment.findFirst({
    where: { childId: child.id },
    select: { id: true },
  });
  if (existing) return;

  const attribution = await resolveAttribution({
    refCode: input.refCode,
    namedEducatorText: input.namedEducatorText,
    serviceId: child.serviceId,
  });

  const newChild = await checkNewChild({
    firstName: child.firstName,
    surname: child.surname,
    dob: child.dob,
    excludeChildIds: [child.id],
    enrolmentDate: input.enrolmentDate,
  });

  const record = await prisma.ambassadorEnrolment.create({
    data: {
      pilotId: centre.pilotId,
      serviceId: child.serviceId,
      childId: child.id,
      enrolmentSubmissionId: input.enrolmentSubmissionId,
      enrolmentApplicationId: input.enrolmentApplicationId,
      childInitials: initialsOf(child.firstName, child.surname),
      refCode: input.refCode,
      namedEducatorText: input.namedEducatorText,
      creditedEducatorId: attribution.creditedEducatorId,
      attributionSource: attribution.attributionSource,
      attributionConflict: attribution.attributionConflict,
      newChildStatus: newChild.status,
      newChildCheckedAt: new Date(),
      newChildDetail: newChild.detail,
    },
    select: { id: true },
  });

  await recomputeAmbassadorRecord(record.id);
}

/**
 * Look up the enrolling parent's captured ref code. ParentAccount emails
 * are stored lowercased+trimmed; there is no FK from submissions, so the
 * join is by email.
 */
async function refCodeForEmail(
  email: string | null | undefined,
): Promise<string | null> {
  if (!email) return null;
  const account = await prisma.parentAccount.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { ambassadorRefCode: true },
  });
  return account?.ambassadorRefCode ?? null;
}

/** Main path: parent-portal enrolment submission (one record per child). */
export async function logAmbassadorEnrolments(input: {
  submissionId: string;
  /** Pass when the caller already knows the account's ref code. */
  refCode?: string | null;
}): Promise<void> {
  try {
    const submission = await prisma.enrolmentSubmission.findUnique({
      where: { id: input.submissionId },
      select: {
        id: true,
        createdAt: true,
        referralEducatorName: true,
        primaryParent: true,
        childRecords: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            dob: true,
            serviceId: true,
          },
        },
      },
    });
    if (!submission) return;

    const refCode =
      input.refCode !== undefined
        ? input.refCode
        : await refCodeForEmail(
            (submission.primaryParent as { email?: string } | null)?.email,
          );

    for (const child of submission.childRecords) {
      try {
        await createRecordForChild({
          child,
          enrolmentDate: submission.createdAt,
          refCode,
          namedEducatorText: submission.referralEducatorName,
          enrolmentSubmissionId: submission.id,
        });
      } catch (err) {
        logger.error("Ambassadors: failed to log record for child", {
          childId: child.id,
          submissionId: submission.id,
          err,
        });
      }
    }
  } catch (err) {
    logger.error("Ambassadors: failed to process submission", {
      submissionId: input.submissionId,
      err,
    });
  }
}

/**
 * Sibling flow: EnrolmentApplication approval creates the Child directly.
 * No referral question exists on this path; attribution comes from the
 * family's ParentAccount ref code (matched by email) when present.
 */
export async function logAmbassadorEnrolmentFromApplication(input: {
  applicationId: string;
  childId: string;
}): Promise<void> {
  try {
    const [application, child] = await Promise.all([
      prisma.enrolmentApplication.findUnique({
        where: { id: input.applicationId },
        select: {
          id: true,
          createdAt: true,
          family: { select: { email: true } },
        },
      }),
      prisma.child.findUnique({
        where: { id: input.childId },
        select: {
          id: true,
          firstName: true,
          surname: true,
          dob: true,
          serviceId: true,
        },
      }),
    ]);
    if (!application || !child) return;

    const refCode = await refCodeForEmail(application.family.email);

    await createRecordForChild({
      child,
      enrolmentDate: application.createdAt,
      refCode,
      namedEducatorText: null,
      enrolmentApplicationId: application.id,
    });
  } catch (err) {
    logger.error("Ambassadors: failed to log record from application", {
      applicationId: input.applicationId,
      childId: input.childId,
      err,
    });
  }
}

/**
 * Late service assignment: a child from a pilot-window submission whose
 * school didn't auto-match gains a serviceId later. The window check uses
 * the ORIGINAL submission date.
 */
export async function logAmbassadorEnrolmentForChild(
  childId: string,
): Promise<void> {
  try {
    const child = await prisma.child.findUnique({
      where: { id: childId },
      select: {
        id: true,
        firstName: true,
        surname: true,
        dob: true,
        serviceId: true,
        enrolmentId: true,
        enrolment: {
          select: {
            id: true,
            createdAt: true,
            referralEducatorName: true,
            primaryParent: true,
          },
        },
      },
    });
    if (!child?.enrolment) return;

    const refCode = await refCodeForEmail(
      (child.enrolment.primaryParent as { email?: string } | null)?.email,
    );

    await createRecordForChild({
      child,
      enrolmentDate: child.enrolment.createdAt,
      refCode,
      namedEducatorText: child.enrolment.referralEducatorName,
      enrolmentSubmissionId: child.enrolment.id,
    });
  } catch (err) {
    logger.error("Ambassadors: failed to log record on service assignment", {
      childId,
      err,
    });
  }
}
