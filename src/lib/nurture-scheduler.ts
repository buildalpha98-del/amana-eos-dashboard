import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Schedule nurture steps when an enquiry changes stage.
 *
 * DUAL SYSTEM: This function creates records in BOTH systems:
 * 1. ParentNurtureStep (LEGACY) — hardcoded template keys + timing
 * 2. SequenceEnrolment + SequenceStepExecution (NEW) — DB-defined sequences
 *
 * Migration path: Once all legacy ParentNurtureStep records are processed
 * (status != "pending"), the legacy block below can be removed. The new
 * system reads sequences from the DB and supports email template overrides.
 *
 * The actual sending is handled by the nurture-send cron job (processes both).
 */
export async function scheduleNurtureFromStageChange(
  enquiryId: string,
  newStage: string,
): Promise<void> {
  const enquiry = await prisma.parentEnquiry.findUnique({
    where: { id: enquiryId },
    select: {
      id: true,
      serviceId: true,
      parentEmail: true,
      parentName: true,
      firstSessionDate: true,
    },
  });

  if (!enquiry) return;

  // We need a contactId for ParentNurtureStep — find or create one based on email
  if (!enquiry.parentEmail) return;

  let contact = await prisma.centreContact.findFirst({
    where: { email: enquiry.parentEmail, serviceId: enquiry.serviceId },
    select: { id: true },
  });

  // Auto-create CentreContact if one doesn't exist yet (common for new enquiries).
  // Without this, the welcome email and all subsequent nurture emails would silently
  // never be scheduled because the scheduler requires a contact record.
  if (!contact) {
    try {
      const firstName = enquiry.parentName?.split(" ")[0] || null;
      contact = await prisma.centreContact.create({
        data: {
          email: enquiry.parentEmail,
          serviceId: enquiry.serviceId,
          firstName,
          subscribed: true,
        },
        select: { id: true },
      });
    } catch (err: unknown) {
      // Unique constraint (P2002) means a concurrent request created the contact — re-fetch
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
        contact = await prisma.centreContact.findFirst({
          where: { email: enquiry.parentEmail, serviceId: enquiry.serviceId },
          select: { id: true },
        });
      }
      if (!contact) return;
    }
  }

  const now = new Date();
  const stepsToCreate: Array<{
    templateKey: string;
    scheduledFor: Date;
    stepNumber: number;
  }> = [];

  switch (newStage) {
    case "new":
      stepsToCreate.push(
        { templateKey: "welcome", scheduledFor: now, stepNumber: 1 },
      );
      break;

    case "info_sent":
      stepsToCreate.push(
        { templateKey: "ccs_assist", scheduledFor: addHours(now, 24), stepNumber: 2 },
        { templateKey: "how_to_enrol", scheduledFor: addHours(now, 48), stepNumber: 3 },
        { templateKey: "nudge_1", scheduledFor: addDays(now, 3), stepNumber: 4 },
      );
      break;

    case "nurturing":
      stepsToCreate.push(
        { templateKey: "nudge_2", scheduledFor: addDays(now, 5), stepNumber: 5 },
        { templateKey: "final_nudge", scheduledFor: addDays(now, 12), stepNumber: 6 },
      );
      break;

    case "form_started":
      stepsToCreate.push(
        { templateKey: "form_support", scheduledFor: addHours(now, 4), stepNumber: 7 },
        { templateKey: "form_abandonment", scheduledFor: addDays(now, 3), stepNumber: 8 },
      );
      break;

    case "first_session": {
      const sessionDate = enquiry.firstSessionDate ?? now;
      // Day before: "See you tomorrow!" reminder
      const reminderDate = addDays(sessionDate, -1);
      if (reminderDate > now) {
        stepsToCreate.push(
          { templateKey: "session_reminder", scheduledFor: reminderDate, stepNumber: 9 },
        );
      }
      stepsToCreate.push(
        { templateKey: "what_to_bring", scheduledFor: sessionDate, stepNumber: 10 },
        { templateKey: "day1_checkin", scheduledFor: addDays(sessionDate, 1), stepNumber: 11 },
        { templateKey: "day3_checkin", scheduledFor: addDays(sessionDate, 3), stepNumber: 12 },
        { templateKey: "app_setup", scheduledFor: addDays(sessionDate, 5), stepNumber: 13 },
        { templateKey: "first_week", scheduledFor: addDays(sessionDate, 7), stepNumber: 14 },
        { templateKey: "week2_feedback", scheduledFor: addDays(sessionDate, 14), stepNumber: 15 },
        { templateKey: "nps_survey", scheduledFor: addDays(sessionDate, 30), stepNumber: 16 },
        { templateKey: "month1_referral", scheduledFor: addDays(sessionDate, 45), stepNumber: 17 },
      );
      break;
    }
  }

  if (stepsToCreate.length === 0) return;

  // Cancel any pending steps from previous stages that no longer apply.
  // e.g., form_abandonment should NOT send if the family already enrolled.
  // e.g., nudge emails should stop once the form is started.
  const cancelMap: Record<string, string[]> = {
    form_started: ["nudge_1", "nudge_2", "final_nudge"],
    first_session: ["form_support", "form_abandonment", "nudge_1", "nudge_2", "final_nudge"],
    enrolled: ["form_support", "form_abandonment", "nudge_1", "nudge_2", "final_nudge"],
    withdrawn: ["form_support", "form_abandonment", "nudge_1", "nudge_2", "final_nudge"],
  };
  const toCancel = cancelMap[newStage];
  if (toCancel && toCancel.length > 0) {
    await prisma.parentNurtureStep.updateMany({
      where: {
        contactId: contact.id,
        enquiryId: enquiry.id,
        templateKey: { in: toCancel },
        status: "pending",
      },
      data: { status: "cancelled" },
    });
  }

  // LEGACY: Create ParentNurtureStep records. These run in parallel with the new
  // SequenceStepExecution system. Safe to remove once no pending legacy steps remain.
  for (const step of stepsToCreate) {
    try {
      await prisma.parentNurtureStep.upsert({
        where: {
          contactId_templateKey: {
            contactId: contact.id,
            templateKey: step.templateKey,
          },
        },
        create: {
          serviceId: enquiry.serviceId,
          contactId: contact.id,
          enquiryId: enquiry.id,
          stepNumber: step.stepNumber,
          templateKey: step.templateKey,
          scheduledFor: step.scheduledFor,
          status: "pending",
        },
        update: {}, // Don't overwrite existing steps
      });
    } catch {
      // Unique constraint violation is fine — step already exists
    }
  }

  // Also create SequenceEnrolment + SequenceStepExecution for the new system
  await createSequenceEnrolment(enquiry, contact.id, newStage);
}

/**
 * Create SequenceEnrolment + SequenceStepExecution records from DB-defined sequences.
 * This runs in parallel with the legacy ParentNurtureStep system.
 */
async function createSequenceEnrolment(
  enquiry: { id: string; serviceId: string; firstSessionDate: Date | null },
  contactId: string,
  stage: string,
): Promise<void> {
  try {
    const sequences = await prisma.sequence.findMany({
      where: { type: "parent_nurture", triggerStage: stage, isActive: true },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    });

    if (sequences.length === 0) return;

    const now = new Date();

    for (const seq of sequences) {
      const anchorDate = stage === "first_session" && enquiry.firstSessionDate
        ? enquiry.firstSessionDate
        : now;

      let enrolment;
      try {
        enrolment = await prisma.sequenceEnrolment.create({
          data: {
            sequenceId: seq.id,
            contactId,
            enquiryId: enquiry.id,
            serviceId: enquiry.serviceId,
            status: "active",
            currentStepNumber: 1,
            anchorDate,
          },
        });
      } catch (err: unknown) {
        // Unique constraint violation = already enrolled, safe to skip
        if (err && typeof err === "object" && "code" in err && err.code === "P2002") continue;
        throw err;
      }

      // Create execution records for each step
      for (const step of seq.steps) {
        const scheduledFor = new Date(anchorDate.getTime() + step.delayHours * 60 * 60 * 1000);
        if (scheduledFor > now || step.delayHours === 0) {
          await prisma.sequenceStepExecution.create({
            data: {
              enrolmentId: enrolment.id,
              stepId: step.id,
              scheduledFor: scheduledFor < now ? now : scheduledFor,
              status: "pending",
            },
          });
        }
      }
    }
  } catch (e) {
    logger.error("Failed to create sequence enrolment", { err: e });
  }
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
