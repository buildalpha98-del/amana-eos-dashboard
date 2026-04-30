import type { SessionType } from "@prisma/client";

export const SESSION_LABELS: Record<SessionType, string> = {
  bsc: "Rise and Shine Club (BSC)",
  asc: "Amana Afternoons (ASC)",
  vc: "Holiday Quest (VC)",
};

export const SESSION_SHORT_LABELS: Record<SessionType, string> = {
  bsc: "Rise and Shine Club",
  asc: "Amana Afternoons",
  vc: "Holiday Quest",
};

export const BOOKING_TYPE_LABELS = {
  permanent: "Permanent",
  casual: "Casual",
} as const;

export const SESSION_ORDER: SessionType[] = ["bsc", "asc", "vc"];
