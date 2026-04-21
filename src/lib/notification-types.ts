/**
 * All known UserNotification.type string literals. Import from here
 * instead of hand-typing strings at creation sites to prevent drift
 * between notification creators and the bell UI.
 */
export const NOTIFICATION_TYPES = {
  CERT_EXPIRING_30D: "cert_expiring_30d",
  CERT_EXPIRING_14D: "cert_expiring_14d",
  CERT_EXPIRING_7D: "cert_expiring_7d",
  CERT_EXPIRED: "cert_expired",
  LEAVE_SUBMITTED: "leave_submitted",
  LEAVE_APPROVED: "leave_approved",
  LEAVE_DENIED: "leave_denied",
  TIMESHEET_SUBMITTED: "timesheet_submitted",
  TIMESHEET_APPROVED: "timesheet_approved",
  // Roster & shift management (added in Sub-project 3b)
  ROSTER_PUBLISHED: "roster_published",
  SHIFT_SWAP_PROPOSED: "shift_swap_proposed",
  SHIFT_SWAP_ACCEPTED: "shift_swap_accepted",
  SHIFT_SWAP_APPROVED: "shift_swap_approved",
  SHIFT_SWAP_REJECTED: "shift_swap_rejected",
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];
