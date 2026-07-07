import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { suppressEmail } from "@/lib/email-suppression";
import { getDefaultNotificationPrefs } from "@/lib/notification-defaults";

/**
 * The reason string tagging suppressions that WE added for a mute — so unmute
 * only lifts our own rows and never un-suppresses a genuine bounce/complaint.
 */
export const MUTE_SUPPRESSION_REASON = "manual_mute";

const ALL_OFF = {
  overdueTodos: false,
  newAssignments: false,
  complianceAlerts: false,
  announcements: false,
  leaveUpdates: false,
  meetingReminders: false,
  rockUpdates: false,
  emailNotifications: false,
  emailDigest: false,
};

/**
 * Mute or unmute ALL of a user's outbound notifications.
 *
 * The app has no single notification gate (in-app rows, assignment emails and
 * push are all created ad-hoc), so this works at the reliable choke points:
 *   - Email → EmailSuppression list, which the central sendEmail() already
 *     skips. Password-reset email is unaffected (it bypasses sendEmail()).
 *   - Push  → the user's PushSubscription rows are deleted.
 *   - Prefs → notificationPrefs all-off, for the cron/digest paths.
 * In-app notifications are LEFT INTACT — the user still sees updates on login.
 *
 * Idempotent. Returns the user's email (handy for logging / toasts).
 */
export async function applyNotificationMute(
  userId: string,
  muted: boolean,
): Promise<{ email: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!user) throw new Error("User not found");

  if (muted) {
    await suppressEmail(user.email, MUTE_SUPPRESSION_REASON, "notification-mute");
    await prisma.pushSubscription.deleteMany({ where: { userId } });
    await prisma.user.update({
      where: { id: userId },
      data: {
        notificationsMuted: true,
        notificationPrefs: ALL_OFF as Prisma.InputJsonValue,
      },
    });
  } else {
    // Only lift OUR manual mute — never un-suppress a real bounce/complaint.
    await prisma.emailSuppression.deleteMany({
      where: { email: user.email.toLowerCase(), reason: MUTE_SUPPRESSION_REASON },
    });
    await prisma.user.update({
      where: { id: userId },
      data: {
        notificationsMuted: false,
        notificationPrefs: getDefaultNotificationPrefs(user.role) as Prisma.InputJsonValue,
      },
    });
  }

  return { email: user.email };
}
