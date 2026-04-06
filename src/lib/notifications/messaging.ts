import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { parentEmailLayout, baseLayout, buttonHtml } from "@/lib/email-templates/base";
import { logger } from "@/lib/logger";

const PORTAL_URL = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

// ── Coordinator lookup ─────────────────────────────────────

async function getServiceCoordinatorEmail(
  serviceId: string,
): Promise<{ email: string; name: string } | null> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      manager: { select: { email: true, name: true } },
      staffMembers: {
        where: { role: "coordinator", active: true },
        select: { email: true, name: true },
        take: 1,
      },
    },
  });

  if (!service) return null;

  // Prefer service manager, fall back to first coordinator
  if (service.manager) return service.manager;
  if (service.staffMembers.length > 0) return service.staffMembers[0];
  return null;
}

// ── New Message Notification ───────────────────────────────

/**
 * Send an email notification when a new message is posted in a conversation.
 *
 * - Staff → parent: email the parent (CentreContact email)
 * - Parent → staff: email the service coordinator
 */
export async function sendNewMessageNotification(
  messageId: string,
): Promise<void> {
  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            service: { select: { id: true, name: true } },
            family: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    if (!message) {
      logger.warn("sendNewMessageNotification: message not found", { messageId });
      return;
    }

    const { conversation } = message;
    const serviceName = conversation.service.name;
    const subject = conversation.subject;

    if (message.senderType === "staff") {
      // Staff sent a message → notify the parent
      const parentEmail = conversation.family.email;
      if (!parentEmail) {
        logger.warn("sendNewMessageNotification: no parent email", { messageId });
        return;
      }

      const parentName = [conversation.family.firstName, conversation.family.lastName]
        .filter(Boolean)
        .join(" ") || "Parent";

      const html = parentEmailLayout(`
        <p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;line-height:1.6;">
          Assalamu Alaikum ${parentName},
        </p>
        <p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;line-height:1.6;">
          You have a new message from <strong>${serviceName}</strong> regarding
          &ldquo;${subject}&rdquo;.
        </p>
        <p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;line-height:1.6;">
          Log in to your parent portal to read and reply.
        </p>
        ${buttonHtml("View Message", `${PORTAL_URL}/parent/messages/${conversation.id}`)}
        <p style="margin:24px 0 0;color:#1a1a2e;font-size:15px;line-height:1.6;">
          Jazak Allahu Khairan,<br/>
          The Amana OSHC Team
        </p>
      `);

      await sendEmail({
        to: parentEmail,
        subject: `New message from ${serviceName} — ${subject}`,
        html,
      });
    } else {
      // Parent sent a message → notify the coordinator
      const coordinator = await getServiceCoordinatorEmail(conversation.service.id);
      if (!coordinator) {
        logger.warn("sendNewMessageNotification: no coordinator found", {
          messageId,
          serviceId: conversation.service.id,
        });
        return;
      }

      const parentName = [conversation.family.firstName, conversation.family.lastName]
        .filter(Boolean)
        .join(" ") || "A parent";

      const html = baseLayout(`
        <p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;line-height:1.6;">
          Hi ${coordinator.name},
        </p>
        <p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;line-height:1.6;">
          <strong>${parentName}</strong> has sent a message regarding
          &ldquo;${subject}&rdquo; for ${serviceName}.
        </p>
        <p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;line-height:1.6;">
          Log in to the dashboard to read and reply.
        </p>
        ${buttonHtml("View Message", `${PORTAL_URL}/messaging`)}
      `);

      await sendEmail({
        to: coordinator.email,
        subject: `New message from ${parentName} — ${subject}`,
        html,
      });
    }
  } catch (err) {
    logger.error("sendNewMessageNotification failed", { messageId, error: err });
  }
}

// ── Broadcast Notification ─────────────────────────────────

/**
 * Send an email to each family in the broadcast.
 * Uses Promise.allSettled for resilience — one failure won't block the rest.
 */
export async function sendBroadcastNotification(
  broadcastId: string,
  familyIds: string[],
): Promise<void> {
  try {
    const broadcast = await prisma.broadcast.findUnique({
      where: { id: broadcastId },
      include: {
        service: { select: { name: true } },
      },
    });

    if (!broadcast) {
      logger.warn("sendBroadcastNotification: broadcast not found", { broadcastId });
      return;
    }

    const families = await prisma.centreContact.findMany({
      where: { id: { in: familyIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    const serviceName = broadcast.service.name;

    const results = await Promise.allSettled(
      families.map(async (family) => {
        if (!family.email) return;

        const parentName = [family.firstName, family.lastName]
          .filter(Boolean)
          .join(" ") || "Parent";

        const html = parentEmailLayout(`
          <p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;line-height:1.6;">
            Assalamu Alaikum ${parentName},
          </p>
          <p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;line-height:1.6;">
            ${broadcast.body}
          </p>
          ${buttonHtml("Open Parent Portal", `${PORTAL_URL}/parent`)}
          <p style="margin:24px 0 0;color:#1a1a2e;font-size:15px;line-height:1.6;">
            Jazak Allahu Khairan,<br/>
            The Amana OSHC Team
          </p>
        `);

        await sendEmail({
          to: family.email,
          subject: `Message from ${serviceName} — ${broadcast.subject}`,
          html,
        });
      }),
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      logger.warn("sendBroadcastNotification: some emails failed", {
        broadcastId,
        total: families.length,
        failed,
      });
    }
  } catch (err) {
    logger.error("sendBroadcastNotification failed", { broadcastId, error: err });
  }
}
