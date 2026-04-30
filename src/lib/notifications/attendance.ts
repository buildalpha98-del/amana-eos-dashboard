import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/notifications/sendEmail";
import { sendPushToParentEmail } from "@/lib/push/webPush";
import { logger } from "@/lib/logger";

const BRAND_COLOR = "#004E64";

function formatTimeAEST(date: Date): string {
  return date.toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Australia/Sydney",
  });
}

function wrapEmail(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f8f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f8f5f2;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <tr><td style="background:${BRAND_COLOR};padding:20px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700;">Amana OSHC</h1>
      </td></tr>
      <tr><td style="height:4px;background:#FECE00;"></td></tr>
      <tr><td style="padding:28px 32px;">
        ${content}
      </td></tr>
      <tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">Amana OSHC | Caring for your children with Islamic values</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

interface ParentInfo {
  email: string;
  firstName: string;
}

async function getPrimaryParent(childId: string): Promise<ParentInfo | null> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: {
      enrolment: {
        select: { primaryParent: true },
      },
    },
  });

  const pp = child?.enrolment?.primaryParent as Record<string, unknown> | null;
  if (!pp?.email) return null;

  return {
    email: pp.email as string,
    firstName: (pp.firstName as string) || "Parent",
  };
}

export async function sendSignInNotification(
  childId: string,
  serviceId: string,
  signInTime: Date,
): Promise<void> {
  try {
    const [child, service, parent] = await Promise.all([
      prisma.child.findUnique({ where: { id: childId }, select: { firstName: true, surname: true } }),
      prisma.service.findUnique({ where: { id: serviceId }, select: { name: true } }),
      getPrimaryParent(childId),
    ]);

    if (!parent) {
      logger.warn("No primary parent email for sign-in notification", { childId });
      return;
    }
    if (!child || !service) return;

    const time = formatTimeAEST(signInTime);

    await sendNotificationEmail({
      to: parent.email,
      toName: parent.firstName,
      subject: `${child.firstName} has been signed in`,
      html: wrapEmail(`
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
          Assalamu Alaikum ${parent.firstName},
        </p>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
          <strong>${child.firstName}</strong> has been signed in at <strong>${service.name}</strong> at <strong>${time}</strong>.
        </p>
        <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">
          Jazak Allahu Khairan,<br/>
          <strong>The Amana OSHC Team</strong>
        </p>
      `),
      type: "attendance_signin",
      relatedId: childId,
      relatedType: "Child",
    });

    sendPushToParentEmail(parent.email, {
      title: `${child.firstName} is in care`,
      body: `Signed in at ${service.name} · ${time}`,
      url: `/parent/children/${childId}`,
    }).catch((err) =>
      logger.error("Failed to send sign-in push", { childId, err }),
    );
  } catch (err) {
    logger.error("Failed to send sign-in notification", { childId, err });
  }
}

export async function sendSignOutNotification(
  childId: string,
  serviceId: string,
  signOutTime: Date,
): Promise<void> {
  try {
    const [child, service, parent] = await Promise.all([
      prisma.child.findUnique({ where: { id: childId }, select: { firstName: true, surname: true } }),
      prisma.service.findUnique({ where: { id: serviceId }, select: { name: true } }),
      getPrimaryParent(childId),
    ]);

    if (!parent) {
      logger.warn("No primary parent email for sign-out notification", { childId });
      return;
    }
    if (!child || !service) return;

    const time = formatTimeAEST(signOutTime);

    await sendNotificationEmail({
      to: parent.email,
      toName: parent.firstName,
      subject: `${child.firstName} has been signed out`,
      html: wrapEmail(`
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
          Assalamu Alaikum ${parent.firstName},
        </p>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
          <strong>${child.firstName}</strong> has been signed out from <strong>${service.name}</strong> at <strong>${time}</strong>.
          We hope they had a wonderful session!
        </p>
        <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">
          Jazak Allahu Khairan,<br/>
          <strong>The Amana OSHC Team</strong>
        </p>
      `),
      type: "attendance_signout",
      relatedId: childId,
      relatedType: "Child",
    });

    sendPushToParentEmail(parent.email, {
      title: `${child.firstName} has been signed out`,
      body: `${service.name} · ${time}`,
      url: `/parent/children/${childId}`,
    }).catch((err) =>
      logger.error("Failed to send sign-out push", { childId, err }),
    );
  } catch (err) {
    logger.error("Failed to send sign-out notification", { childId, err });
  }
}
