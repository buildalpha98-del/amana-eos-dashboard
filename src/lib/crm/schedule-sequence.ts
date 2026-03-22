import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Schedule CRM outreach sequences when a lead's pipeline stage changes.
 * Creates SequenceEnrolment + SequenceStepExecution records for any
 * active sequences that match the new stage.
 */
export async function scheduleCrmSequence(
  leadId: string,
  newStage: string,
): Promise<void> {
  try {
    const sequences = await prisma.sequence.findMany({
      where: { type: "crm_outreach", triggerStage: newStage, isActive: true },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    });

    if (sequences.length === 0) return;

    const now = new Date();

    for (const seq of sequences) {
      // Skip if already enrolled in this sequence
      const existing = await prisma.sequenceEnrolment.findFirst({
        where: { sequenceId: seq.id, leadId },
      });
      if (existing) continue;

      const enrolment = await prisma.sequenceEnrolment.create({
        data: {
          sequenceId: seq.id,
          leadId,
          status: "active",
          currentStepNumber: 1,
          anchorDate: now,
        },
      });

      // Create execution records for each step
      for (const step of seq.steps) {
        const scheduledFor = new Date(now.getTime() + step.delayHours * 60 * 60 * 1000);
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
  } catch (e) {
    logger.error("Failed to schedule CRM sequence", { err: e });
  }
}
