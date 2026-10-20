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
 * Fire-and-forget and NEVER throws, not even synchronously: an incident or
 * complaint save must succeed whether or not Knox is healthy. A failed
 * enqueue is logged and the sweep cron picks the record up later.
 *
 * Contract: call this AFTER the write (and any transaction around it) has
 * resolved. It uses the top-level `prisma` client on purpose; a transaction
 * client would let a failed enqueue abort the caller's save.
 *
 * `immediate` (the dashboard routes) queues the job and runs it once the
 * response has gone out. Both steps sit inside `runAfter` so neither is cut
 * off when a serverless response returns; registering `after()` only after an
 * awaited enqueue could land past the point the platform stops listening.
 * Leave it off for bulk writers such as the OWNA sync: the job is queued
 * here and the sweep drains the queue at its own pace.
 */
export function triggerTriage(
  input: EnqueueTriageInput,
  opts: { immediate?: boolean } = {},
): void {
  const run = async (): Promise<void> => {
    try {
      const jobId = await enqueueTriage(prisma, input);
      if (jobId && opts.immediate) await runTriageJob(jobId);
    } catch (err) {
      logger.error("Knox: triggerTriage failed", { err, ...input });
    }
  };

  try {
    if (opts.immediate) runAfter(run);
    else void run();
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
  category: string;
  status: string;
}

/** Notifiability, its reason, the category, or the complaint being escalated. */
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
  // category is not editable through ComplaintPatch today; honoured if it ever is.
  const category = (patch as { category?: string }).category;
  if (category !== undefined && category !== before.category) return true;
  if (patch.status === "escalated" && before.status !== "escalated") return true;
  return false;
}
