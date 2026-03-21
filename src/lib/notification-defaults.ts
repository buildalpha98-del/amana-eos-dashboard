/**
 * Role-based default notification preferences.
 *
 * Used when:
 * - Creating new users (set notificationPrefs on creation)
 * - Fetching notifications for users with null/empty prefs (fallback)
 * - Backfilling existing users who never had prefs set
 */

export interface NotificationPrefs {
  overdueTodos: boolean;
  newAssignments: boolean;
  complianceAlerts: boolean;
  announcements: boolean;
  leaveUpdates: boolean;
  meetingReminders: boolean;
  rockUpdates: boolean;
  emailNotifications: boolean;
  emailDigest: boolean;
  [key: string]: boolean;
}

const ALL_ON: NotificationPrefs = {
  overdueTodos: true,
  newAssignments: true,
  complianceAlerts: true,
  announcements: true,
  leaveUpdates: true,
  meetingReminders: true,
  rockUpdates: true,
  emailNotifications: true,
  emailDigest: true,
};

/**
 * Returns sensible default notification preferences based on user role.
 *
 * - owner / head_office / admin: all notifications enabled
 * - member / coordinator: all except leaveUpdates defaults to true
 * - staff: core work notifications, no rock updates
 * - marketing: work notifications, no compliance or rock updates
 */
export function getDefaultNotificationPrefs(role: string): NotificationPrefs {
  switch (role) {
    case "owner":
    case "head_office":
    case "admin":
      return { ...ALL_ON };

    case "member":
    case "coordinator":
      return {
        overdueTodos: true,
        newAssignments: true,
        complianceAlerts: true,
        announcements: true,
        leaveUpdates: true,
        meetingReminders: true,
        rockUpdates: true,
        emailNotifications: true,
        emailDigest: true,
      };

    case "marketing":
      return {
        overdueTodos: true,
        newAssignments: true,
        complianceAlerts: false,
        announcements: true,
        leaveUpdates: false,
        meetingReminders: true,
        rockUpdates: false,
        emailNotifications: true,
        emailDigest: true,
      };

    case "staff":
    default:
      return {
        overdueTodos: true,
        newAssignments: true,
        complianceAlerts: true,
        announcements: true,
        leaveUpdates: false,
        meetingReminders: true,
        rockUpdates: false,
        emailNotifications: true,
        emailDigest: true,
      };
  }
}
