import { NextResponse } from "next/server";
import { getOrgSettings } from "@/lib/org-settings";

/**
 * Pause switch for SERVICE-OPERATIONS alert crons (2026-09-14).
 *
 * The services portal isn't in use yet, so the crons that email centre
 * managers / leadership about low occupancy, ratio risk, shift gaps,
 * staffing variance, checklist completion, unactioned bookings,
 * unsigned-in children and the weekly incident digest are gated on
 * `notifications.serviceAlertsPaused` in org settings (default: paused,
 * editable in Settings → Organisation).
 *
 * Deliberately NOT applied to staff-facing mail — cert/visa expiry,
 * compliance, training, leave, timesheets, contracts, digests of in-app
 * notifications — those keep flowing.
 *
 * Usage, immediately after `acquireCronLock`:
 *
 *   const paused = await skipIfServiceAlertsPaused(guard);
 *   if (paused) return paused;
 *
 * The lock is still consumed and completed with a `paused` marker so the
 * cron-health surface shows the run happened and why nothing went out.
 */

export const SERVICE_ALERTS_PAUSED_REASON = "service_alerts_paused";

export async function isServiceAlertsPaused(): Promise<boolean> {
  const settings = await getOrgSettings();
  return settings.notifications.serviceAlertsPaused;
}

interface CompletableGuard {
  complete: (result?: Record<string, unknown>) => Promise<void>;
}

export async function skipIfServiceAlertsPaused(
  guard: CompletableGuard,
): Promise<NextResponse | null> {
  if (!(await isServiceAlertsPaused())) return null;
  await guard.complete({ skipped: true, reason: SERVICE_ALERTS_PAUSED_REASON });
  return NextResponse.json({
    message:
      "Service alert emails are paused (Settings → Organisation → Service alert emails)",
    skipped: true,
    reason: SERVICE_ALERTS_PAUSED_REASON,
  });
}
