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
      let enrolment;
      try {
        enrolment = await prisma.sequenceEnrolment.create({
          data: {
            sequenceId: seq.id,
            leadId,
            status: "active",
            currentStepNumber: 1,
            anchorDate: now,
          },
        });
      } catch (err: unknown) {
        // Unique constraint violation = already enrolled, safe to skip
        if (err && typeof err === "object" && "code" in err && err.code === "P2002") continue;
        throw err;
      }

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
