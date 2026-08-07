import { prisma } from "@/lib/prisma";
import { getResend, sendEmail } from "@/lib/email";
import {
  todoAssignedEmail,
  rockAssignedEmail,
  issueAssignedEmail,
  creativeRequestAssignedEmail,
} from "@/lib/email-templates";
import { getDefaultNotificationPrefs } from "@/lib/notification-defaults";
import { parseJsonField, notificationPrefsSchema } from "@/lib/schemas/json-fields";
import { logger } from "@/lib/logger";
import { shouldReceiveNudge } from "@/lib/notification-recipients";

/**
 * Fire-and-forget assignment notification email.
 * Looks up the assignee + assigner names from the database,
 * selects the right template, and sends via the suppression-aware
 * sendEmail() wrapper.
 *
 * Skipped when the assignee is muted, has the newAssignments /
 * emailNotifications preference off, or is on the suppression list
 * (sendEmail handles that last one).
 *
 * Graceful no-op when RESEND_API_KEY is not configured.
 * Errors are caught internally — safe to call without await.
 */
export function sendAssignmentEmail(params: {
  type: "todo" | "rock" | "issue" | "creative_request";
  assigneeId: string;
  assignerId: string;
  entityTitle: string;
  /** Required for "creative_request" — used for the deep link + request number. */
  entityId?: string;
  entityNumber?: string;
}): Promise<void> {
  if (!getResend()) return Promise.resolve(); // No API key configured — skip silently

  const baseUrl =
    process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

  const run = async () => {
    const [assignee, assigner] = await Promise.all([
      prisma.user.findUnique({
        where: { id: params.assigneeId },
        select: {
          name: true,
          email: true,
          role: true,
          receivesNudges: true,
          notificationsMuted: true,
          active: true,
          notificationPrefs: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: params.assignerId },
        select: { name: true },
      }),
    ]);

    if (!assignee?.email) return; // Can't send without an email address
    if (assignee.notificationsMuted) return;

    const prefs = {
      ...getDefaultNotificationPrefs(assignee.role),
      ...parseJsonField(assignee.notificationPrefs, notificationPrefsSchema, {}),
    };
    if (!prefs.emailNotifications || !prefs.newAssignments) return;

    if (params.type === "creative_request") {
      // 2026-08-07 gate decision: creative-request assignment is a
      // work-queue notification, not a leadership nudge — the assignee
      // is routinely a marketing-role staffer being handed a ticket in
      // their own queue. shouldReceiveNudge() deliberately excludes
      // marketing (and other non-leadership roles) by design for the
      // *nudge* surface, so we bypass that role gate here. We still
      // enforce the baseline account gates shouldReceiveNudge also
      // applies: the assignee must be active and not have muted
      // notifications.
      if (assignee.active === false || assignee.notificationsMuted) return;
    } else {
      // 2026-07-24: nudge policy — assignment emails only go to leadership
      // + opted-in users. Staff/coordinator/marketing see the assignment
      // in-app (via UserNotification), which stays on the bell icon and
      // My Todos surface.
      if (!shouldReceiveNudge(assignee)) return;
    }

    const assigneeName = assignee.name || "Team Member";
    const assignerName = assigner?.name || "A team member";

    let template: { subject: string; html: string };

    switch (params.type) {
      case "todo": {
        const dashboardUrl = `${baseUrl}/todos`;
        template = await todoAssignedEmail(
          assigneeName,
          params.entityTitle,
          assignerName,
          dashboardUrl
        );
        break;
      }
      case "rock": {
        const dashboardUrl = `${baseUrl}/rocks`;
        template = await rockAssignedEmail(
          assigneeName,
          params.entityTitle,
          assignerName,
          dashboardUrl
        );
        break;
      }
      case "issue": {
        const dashboardUrl = `${baseUrl}/issues`;
        template = await issueAssignedEmail(
          assigneeName,
          params.entityTitle,
          assignerName,
          dashboardUrl
        );
        break;
      }
      case "creative_request": {
        if (!params.entityId) return; // Can't build a deep link without it
        const dashboardUrl = `${baseUrl}/requests?open=${params.entityId}`;
        template = await creativeRequestAssignedEmail(
          assigneeName,
          params.entityTitle,
          params.entityNumber || "",
          assignerName,
          dashboardUrl
        );
        break;
      }
    }

    await sendEmail({
      to: assignee.email,
      subject: template.subject,
      html: template.html,
    });
  };

  // Fire-and-forget: kick off the async work, catch any errors
  return run().catch((err) => logger.error("Failed to send assignment email", { err, type: params.type, assigneeId: params.assigneeId }));
}
