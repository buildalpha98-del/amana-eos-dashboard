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
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];
