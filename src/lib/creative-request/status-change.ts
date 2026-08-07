import type { CreativeRequestStatus } from "@prisma/client";
import { STATUS_TIMESTAMP_FIELD } from "@/lib/creative-request/constants";

interface PauseState {
  status: CreativeRequestStatus;
  pausedAt: Date | null;
  pausedMs: number;
}

/**
 * Build the Prisma update `data` for a status transition: stage timestamp
 * plus turnaround-pause accounting. The pause clock runs while the request
 * sits in in_review (waiting on the requester's decision) — entering starts
 * it, leaving banks the elapsed time. THE single place transitions mutate
 * these fields; used by the PATCH route and both proof routes.
 *
 * Caller remains responsible for transition VALIDITY (isValidTransition)
 * and for cancellationReason.
 */
export function applyStatusChange(
  existing: PauseState,
  toStatus: CreativeRequestStatus,
  now = new Date(),
): Record<string, unknown> {
  const data: Record<string, unknown> = { status: toStatus };
  const tsField = STATUS_TIMESTAMP_FIELD[toStatus];
  if (tsField) data[tsField] = now;

  const wasPaused = existing.status === "in_review";
  const willPause = toStatus === "in_review";
  if (!wasPaused && willPause) {
    data.pausedAt = now;
  } else if (wasPaused && !willPause) {
    data.pausedAt = null;
    // Clamp: pausedMs is a signed Int32 column (max ~24.8 days of ms). A
    // proof ignored for a month must not 500 the transition that leaves
    // in_review — cap the banked total instead.
    data.pausedMs = Math.min(
      2_000_000_000,
      existing.pausedMs +
        (existing.pausedAt ? Math.max(0, now.getTime() - existing.pausedAt.getTime()) : 0),
    );
  }
  return data;
}
