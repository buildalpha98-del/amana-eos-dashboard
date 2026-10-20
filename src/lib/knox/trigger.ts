import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { runAfter } from "@/lib/run-after";
import { enqueueTriage, type EnqueueTriageInput } from "@/lib/knox/enqueue";
import { runTriageJob } from "@/lib/knox/worker";
import type { IncidentPatch } from "@/lib/incidents/update-incident-record";
import type { ComplaintPatch } from "@/lib/complaints/update-complaint-record";

/**
 * Hand a register record to Knox after its write has committed.
 *
 * Callers `await` this BEFORE responding: the job row is then durable before
 * the 201/200 goes out, and `after()` is registered inside the request scope.
 * It never rejects: any failure (enqueue, `runAfter`) is logged and swallowed,
 * because an incident or complaint save must succeed whether or not Knox is
 * healthy. A failed enqueue leaves the record for the sweep cron.
 *
 * Contract: call this AFTER the write (and any transaction around it) has
 * resolved. It uses the top-level `prisma` client on purpose; a transaction
 * client would let a failed enqueue abort the caller's save.
 *
 * `immediate` (the dashboard routes) also starts the job once the response has
 * gone out, via `runAfter`. Leave it off for bulk writers such as the OWNA
 * sync: the sweep drains the queue at its own pace.
 */
export async function triggerTriage(
  input: EnqueueTriageInput,
  opts: { immediate?: boolean } = {},
): Promise<void> {
  try {
    const jobId = await enqueueTriage(prisma, input);
    if (jobId && opts.immediate) {
      runAfter(async () => {
        try {
          await runTriageJob(jobId);
        } catch (err) {
          logger.error("Knox: immediate triage run failed", { err, jobId, ...input });
        }
      });
    }
  } catch (err) {
    logger.error("Knox: triggerTriage failed", { err, ...input });
  }
}

const isBlank = (v: string | null | undefined): boolean => v === null || v === undefined || v.trim() === "";

export interface IncidentTriggerFields {
  severity: string;
  incidentType: string;
  reportableToAuthority: boolean;
  seriousIncidentCategory: string | null;
  ambulanceCalled: boolean;
  medicalPersonnelContacted: string | null;
}

/**
 * Did this edit change something Knox's rules read? Cosmetic edits (a longer
 * description, a follow-up tick) must not burn a model call.
 */
export function incidentTriggerChanged(
  before: IncidentTriggerFields,
  patch: IncidentPatch,
): boolean {
  if (patch.severity !== undefined && patch.severity !== before.severity) return true;
  if (patch.incidentType !== undefined && patch.incidentType !== before.incidentType) return true;
  if (
    patch.reportableToAuthority !== undefined &&
    patch.reportableToAuthority !== before.reportableToAuthority
  ) {
    return true;
  }
  if (
    patch.seriousIncidentCategory !== undefined &&
    patch.seriousIncidentCategory !== before.seriousIncidentCategory
  ) {
    return true;
  }
  if (patch.ambulanceCalled !== undefined && patch.ambulanceCalled !== before.ambulanceCalled) {
    return true;
  }
  if (
    patch.medicalPersonnelContacted !== undefined &&
    isBlank(before.medicalPersonnelContacted) &&
    !isBlank(patch.medicalPersonnelContacted)
  ) {
    return true;
  }
  return false;
}

export interface ComplaintTriggerFields {
  notifiable: boolean;
  notifiableReason: string | null;
  status: string;
}

/**
 * Notifiability, its reason, or the complaint being escalated. (Category cannot
 * change via PATCH, so it is not compared.)
 */
export function complaintTriggerChanged(
  before: ComplaintTriggerFields,
  patch: ComplaintPatch,
): boolean {
  if (patch.notifiable !== undefined && patch.notifiable !== before.notifiable) return true;
  if (
    patch.notifiableReason !== undefined &&
    patch.notifiableReason !== before.notifiableReason
  ) {
    return true;
  }
  if (patch.status === "escalated" && before.status !== "escalated") return true;
  return false;
}
