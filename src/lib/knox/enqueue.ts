import type { Prisma, PrismaClient, TriageSubjectType } from "@prisma/client";
import { logger } from "@/lib/logger";

type Db = PrismaClient | Prisma.TransactionClient;

export interface EnqueueTriageInput {
  subjectType: TriageSubjectType;
  subjectId: string;
  serviceId: string;
  reason: "created" | "updated" | "sweep";
}

/**
 * Queue a Knox triage job for an incident-register record.
 *
 * Dedupes on a still-pending job for the same subject (a running job does not
 * block a new one, so edits made mid-run are re-triaged). Never throws: an
 * incident save must succeed even when Knox is down. Returns the job id, or
 * null on any error (logged).
 */
export async function enqueueTriage(
  db: Db,
  input: EnqueueTriageInput,
): Promise<string | null> {
  try {
    const existing = await db.triageJob.findFirst({
      where: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        status: "pending",
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const job = await db.triageJob.create({
      data: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        serviceId: input.serviceId,
        reason: input.reason,
      },
      select: { id: true },
    });
    return job.id;
  } catch (err) {
    logger.error("Knox: failed to enqueue triage job", {
      err,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      serviceId: input.serviceId,
      reason: input.reason,
    });
    return null;
  }
}
