import type { CreativeRequestStatus, CreativeRequestType } from "@prisma/client";

/** Roles that work the queue (vs centre roles who submit). */
export const FULFILLER_ROLES = ["marketing", "owner", "head_office", "admin"] as const;
export type FulfillerRole = (typeof FULFILLER_ROLES)[number];

export function isFulfillerRole(role: string): boolean {
  return (FULFILLER_ROLES as readonly string[]).includes(role);
}

/** Allowed status moves. Cancel is allowed from any pre-approval state. */
export const TRANSITIONS: Record<CreativeRequestStatus, CreativeRequestStatus[]> = {
  new: ["briefed", "cancelled"],
  briefed: ["in_progress", "cancelled"],
  in_progress: ["in_review", "cancelled"],
  in_review: ["changes_requested", "approved", "cancelled"],
  changes_requested: ["in_review", "cancelled"],
  approved: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function isValidTransition(
  from: CreativeRequestStatus,
  to: CreativeRequestStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Which timestamp column each status entry stamps (null = createdAt covers it). */
export const STATUS_TIMESTAMP_FIELD: Record<
  CreativeRequestStatus,
  | "briefedAt"
  | "inProgressAt"
  | "inReviewAt"
  | "changesRequestedAt"
  | "approvedAt"
  | "deliveredAt"
  | "cancelledAt"
  | null
> = {
  new: null,
  briefed: "briefedAt",
  in_progress: "inProgressAt",
  in_review: "inReviewAt",
  changes_requested: "changesRequestedAt",
  approved: "approvedAt",
  delivered: "deliveredAt",
  cancelled: "cancelledAt",
};

/** Default turnaround per request type, in business days (Asana pattern:
 *  type sets the due date, not negotiation). */
export const TURNAROUND_BUSINESS_DAYS: Record<CreativeRequestType, number> = {
  flyer: 3,
  poster: 5,
  social_tile: 2,
  table_cover: 5,
  banner_signage: 7,
  email_header: 2,
  merch: 10,
  other: 5,
};

/** Add N business days (Mon–Fri), UTC-date based. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

export function defaultDueDate(type: CreativeRequestType, from = new Date()): Date {
  return addBusinessDays(from, TURNAROUND_BUSINESS_DAYS[type]);
}

/** True if `d` falls before the start of today (UTC). */
export function isBeforeToday(d: Date): boolean {
  const t = new Date();
  t.setUTCHours(0, 0, 0, 0);
  return d < t;
}

/** UI labels — single source for board columns and chips. */
export const STATUS_LABELS: Record<CreativeRequestStatus, string> = {
  new: "New",
  briefed: "Briefed",
  in_progress: "In progress",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const TYPE_LABELS: Record<CreativeRequestType, string> = {
  flyer: "Flyer",
  poster: "Poster",
  social_tile: "Social tile",
  table_cover: "Table cover",
  banner_signage: "Banner / signage",
  email_header: "Email header",
  merch: "Merch / uniform",
  other: "Something else",
};
