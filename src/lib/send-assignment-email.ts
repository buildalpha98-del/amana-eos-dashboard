import { prisma } from "@/lib/prisma";
import { getResend, FROM_EMAIL } from "@/lib/email";
import {
  todoAssignedEmail,
  rockAssignedEmail,
  issueAssignedEmail,
} from "@/lib/email-templates";

/**
 * Fire-and-forget assignment notification email.
 * Looks up the assignee + assigner names from the database,
 * selects the right template, and sends via Resend.
 *
 * Graceful no-op when RESEND_API_KEY is not configured.
 * Errors are caught internally — safe to call without await.
 */
export function sendAssignmentEmail(params: {
  type: "todo" | "rock" | "issue";
  assigneeId: string;
  assignerId: string;
  entityTitle: string;
}) {
  const resend = getResend();
  if (!resend) return; // No API key configured — skip silently

  const baseUrl =
    process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

  const run = async () => {
    const [assignee, assigner] = await Promise.all([
      prisma.user.findUnique({
        where: { id: params.assigneeId },
        select: { name: true, email: true },
      }),
      prisma.user.findUnique({
        where: { id: params.assignerId },
        select: { name: true },
      }),
    ]);

    if (!assignee?.email) return; // Can't send without an email address

    const assigneeName = assignee.name || "Team Member";
    const assignerName = assigner?.name || "A team member";

    let template: { subject: string; html: string };

    switch (params.type) {
      case "todo": {
        const dashboardUrl = `${baseUrl}/todos`;
        template = todoAssignedEmail(
          assigneeName,
          params.entityTitle,
          assignerName,
          dashboardUrl
        );
        break;
      }
      case "rock": {
        const dashboardUrl = `${baseUrl}/rocks`;
        template = rockAssignedEmail(
          assigneeName,
          params.entityTitle,
          assignerName,
          dashboardUrl
        );
        break;
      }
      case "issue": {
        const dashboardUrl = `${baseUrl}/issues`;
        template = issueAssignedEmail(
          assigneeName,
          params.entityTitle,
          assignerName,
          dashboardUrl
        );
        break;
      }
    }

    await resend.emails.send({
      from: FROM_EMAIL,
      to: assignee.email,
      subject: template.subject,
      html: template.html,
    });
  };

  // Fire-and-forget: kick off the async work, catch any errors
  run().catch(console.error);
}
