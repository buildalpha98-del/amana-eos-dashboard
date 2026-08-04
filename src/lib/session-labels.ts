import type { SessionType } from "@prisma/client";

/**
 * Partial since 2026-08-04: the enum gained four spare slots a centre
 * names itself, and there is no org-wide label for those — they're
 * whatever that centre called them. Use sessionLabel() so an extra slot
 * degrades to its code rather than rendering blank.
 */
export const SESSION_LABELS: Partial<Record<SessionType, string>> = {
  bsc: "Rise and Shine Club (BSC)",
  asc: "Amana Afternoons (ASC)",
  vc: "Holiday Quest (VC)",
};

export const SESSION_SHORT_LABELS: Partial<Record<SessionType, string>> = {
  bsc: "Rise and Shine Club",
  asc: "Amana Afternoons",
  vc: "Holiday Quest",
};

/** Label for a session code, falling back to the code itself. */
export function sessionLabel(t: SessionType | string): string {
  return SESSION_SHORT_LABELS[t as SessionType] ?? String(t).toUpperCase();
}

export const BOOKING_TYPE_LABELS = {
  permanent: "Permanent",
  casual: "Casual",
} as const;

export const SESSION_ORDER: SessionType[] = ["bsc", "asc", "vc"];
