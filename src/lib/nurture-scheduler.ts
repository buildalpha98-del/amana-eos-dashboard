import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Schedule nurture emails when an enquiry changes stage.
 *
 * The parent nurture sequence is driven entirely by the SequenceEnrolment /
 * SequenceStepExecution system (DB-defined `Sequence`s seeded from
 * `src/lib/sequence-seed-data.ts`). The legacy `ParentNurtureStep` table is no
 * longer written here — it was retired in the 2026-06 cutover to stop the two
 * systems double-sending. The `nurture-send` cron processes the executions
 * created below.
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
      channel: true,
    },
  });

  if (!enquiry) return;

  // We need a contactId to enrol — find or create one based on email.
  if (!enquiry.parentEmail) return;

  let contact = await prisma.centreContact.findFirst({
    where: { email: enquiry.parentEmail, serviceId: enquiry.serviceId },
    select: { id: true },
  });

  // Auto-create CentreContact if one doesn't exist yet (common for new enquiries).
  // Without this, the welcome email and all subsequent nurture emails would
  // silently never be scheduled because enrolment requires a contact record.
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

  // Cancel any pending executions from earlier stages that no longer apply.
  // e.g. abandonment/nudge emails must stop once the family starts the form or
  // attends their first session.
  const toCancel = STAGE_CANCEL_MAP[newStage];
  if (toCancel && toCancel.length > 0) {
    await cancelStaleExecutions(contact.id, enquiry.id, toCancel);
  }

  // Create SequenceEnrolment + SequenceStepExecution records for the new stage.
  await createSequenceEnrolment(enquiry, contact.id, newStage);
}

/**
 * When a family advances, earlier-stage nurture/nudge emails become
 * inappropriate. Map the new stage → the template keys whose pending
 * executions should be cancelled.
 */
const PRE_ENROLMENT_KEYS = [
  "welcome",
  "ccs_assist",
  "form_support",
  "form_abandonment",
  "nudge_1",
  "nudge_2",
  "final_nudge",
];

const STAGE_CANCEL_MAP: Record<string, string[]> = {
  // ccs_assist stays live during form_started — CCS help is still relevant
  // while the family is mid-form.
  form_started: ["nudge_1", "nudge_2", "final_nudge"],
  first_session: PRE_ENROLMENT_KEYS,
  enrolled: PRE_ENROLMENT_KEYS,
  withdrawn: PRE_ENROLMENT_KEYS,
  waitlisted: PRE_ENROLMENT_KEYS,
  cold: PRE_ENROLMENT_KEYS,
};

/**
 * Website enquiries already receive an instant auto-response from the
 * marketing site (centre details + AI-drafted answer), so the sequence's
 * 0-hour welcome would double up. Every later step still applies.
 */
const WEBSITE_SKIP_TEMPLATE_KEYS = new Set(["welcome"]);

/**
 * Cancel pending SequenceStepExecutions for this contact+enquiry whose step
 * template is in `templateKeys`. Done as find-then-updateMany-by-id so it works
 * across Prisma versions (relation filters aren't reliably supported in
 * `updateMany` where clauses).
 */
async function cancelStaleExecutions(
  contactId: string,
  enquiryId: string,
  templateKeys: string[],
): Promise<void> {
  const stale = await prisma.sequenceStepExecution.findMany({
    where: {
      status: "pending",
      enrolment: { contactId, enquiryId },
      step: { templateKey: { in: templateKeys } },
    },
    select: { id: true },
  });
  if (stale.length === 0) return;
  await prisma.sequenceStepExecution.updateMany({
    where: { id: { in: stale.map((e) => e.id) } },
    data: { status: "cancelled" },
  });
}

/**
 * Create SequenceEnrolment + SequenceStepExecution records from DB-defined
 * sequences whose `triggerStage` matches the new stage.
 */
async function createSequenceEnrolment(
  enquiry: { id: string; serviceId: string; firstSessionDate: Date | null; channel: string | null },
  contactId: string,
  stage: string,
): Promise<void> {
  try {
    const sequences = await prisma.sequence.findMany({
      where: { type: "parent_nurture", triggerStage: stage, isActive: true },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    });

    if (sequences.length === 0) return;

    // Sequences for different stages share template keys (the New Enquiry
    // Journey covers the whole chain; Info Sent / Nurturing re-cover parts of
    // it when staff move the card manually). Never schedule a template this
    // family already has pending or sent.
    const priorExecutions = await prisma.sequenceStepExecution.findMany({
      where: {
        enrolment: { contactId, enquiryId: enquiry.id },
        status: { in: ["pending", "sent"] },
      },
      select: { step: { select: { templateKey: true } } },
    });
    const alreadyScheduled = new Set(priorExecutions.map((e) => e.step.templateKey));

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
        if (alreadyScheduled.has(step.templateKey)) continue;
        if (enquiry.channel === "website" && WEBSITE_SKIP_TEMPLATE_KEYS.has(step.templateKey)) {
          continue;
        }
        const scheduledFor = new Date(anchorDate.getTime() + step.delayHours * 60 * 60 * 1000);
        // Skip steps whose send time has already passed (e.g. a day-before
        // reminder for a session that's today), but always honour a 0-delay
        // "send immediately" step.
        if (scheduledFor > now || step.delayHours === 0) {
          await prisma.sequenceStepExecution.create({
            data: {
              enrolmentId: enrolment.id,
              stepId: step.id,
              scheduledFor: scheduledFor < now ? now : scheduledFor,
              status: "pending",
            },
          });
          alreadyScheduled.add(step.templateKey);
        }
      }
    }
  } catch (e) {
    logger.error("Failed to create sequence enrolment", { err: e });
  }
}
