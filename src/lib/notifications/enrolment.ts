import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/notifications/sendEmail";
import { parentEmailLayout, baseLayout, buttonHtml } from "@/lib/email-templates/base";
import { logger } from "@/lib/logger";

const PORTAL_URL = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

function formatDateAU(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
}

async function getServiceCoordinatorEmail(
  serviceId: string,
): Promise<{ email: string; name: string } | null> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      manager: { select: { email: true, name: true } },
      staffMembers: {
        where: { role: "member", active: true },
        select: { email: true, name: true },
        take: 1,
      },
    },
  });

  if (service?.manager) return service.manager;
  if (service?.staffMembers?.[0]) return service.staffMembers[0];
  return null;
}

async function loadApplication(applicationId: string) {
  return prisma.enrolmentApplication.findUniqueOrThrow({
    where: { id: applicationId },
    include: {
      service: { select: { id: true, name: true } },
      family: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
}

// ── 1. Received — notify coordinator ───────────────────────

export async function sendEnrolmentReceivedNotification(
  applicationId: string,
): Promise<void> {
  try {
    const app = await loadApplication(applicationId);
    const coordinator = await getServiceCoordinatorEmail(app.serviceId);
    if (!coordinator) {
      logger.warn("No coordinator found for enrolment notification", {
        applicationId,
        serviceId: app.serviceId,
      });
      return;
    }

    const parentName = [app.family.firstName, app.family.lastName]
      .filter(Boolean)
      .join(" ") || app.family.email;
    const dob = formatDateAU(app.childDateOfBirth);

    await sendNotificationEmail({
      to: coordinator.email,
      toName: coordinator.name,
      subject: `New sibling enrolment application — ${app.childFirstName} ${app.childLastName}`,
      html: baseLayout(`
        <h2 style="margin:0 0 12px;color:#111827;font-size:18px;font-weight:600;">
          New Sibling Enrolment Application
        </h2>
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
          <strong>${parentName}</strong> has submitted a sibling enrolment application
          for <strong>${app.childFirstName} ${app.childLastName}</strong>
          (DOB: ${dob}) at <strong>${app.service.name}</strong>.
        </p>
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
          Log in to review and approve this application.
        </p>
        ${buttonHtml("Review Application", `${PORTAL_URL}/enrolments`)}
      `),
      type: "enrolment_received",
      relatedId: applicationId,
      relatedType: "EnrolmentApplication",
    });
  } catch (err) {
    logger.error("Failed to send enrolment received notification", {
      applicationId,
      err,
    });
  }
}

// ── 2. Approved — notify parent ────────────────────────────

export async function sendEnrolmentApprovedNotification(
  applicationId: string,
): Promise<void> {
  try {
    const app = await loadApplication(applicationId);

    const parentName = app.family.firstName || "Parent";
    const startDateStr = app.startDate
      ? formatDateAU(app.startDate)
      : "the agreed start date";

    await sendNotificationEmail({
      to: app.family.email,
      toName: parentName,
      subject: `Enrolment approved — ${app.childFirstName} ${app.childLastName}`,
      html: parentEmailLayout(`
        <h2 style="margin:0 0 12px;color:#111827;font-size:18px;font-weight:600;">
          Enrolment Approved
        </h2>
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
          Assalamu Alaikum ${parentName},
        </p>
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
          We are pleased to confirm that <strong>${app.childFirstName}</strong>&apos;s
          enrolment application at <strong>${app.service.name}</strong> has been approved.
          Your child&apos;s profile has been created and they are ready to start on
          <strong>${startDateStr}</strong>.
        </p>
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
          Please log in to your parent portal to complete any remaining details.
        </p>
        ${buttonHtml("Open Parent Portal", `${PORTAL_URL}/parent`)}
        <p style="margin:16px 0 0;color:#9ca3af;font-size:13px;line-height:1.5;">
          Jazak Allahu Khairan,<br/>
          The Amana OSHC Team
        </p>
      `),
      type: "enrolment_approved",
      relatedId: applicationId,
      relatedType: "EnrolmentApplication",
    });
  } catch (err) {
    logger.error("Failed to send enrolment approved notification", {
      applicationId,
      err,
    });
  }
}

// ── 3. Declined — notify parent ────────────────────────────

export async function sendEnrolmentDeclinedNotification(
  applicationId: string,
  reason?: string,
): Promise<void> {
  try {
    const app = await loadApplication(applicationId);

    const parentName = app.family.firstName || "Parent";

    const reasonBlock = reason
      ? `<p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
          <strong>Reason:</strong> ${reason}
        </p>`
      : "";

    await sendNotificationEmail({
      to: app.family.email,
      toName: parentName,
      subject: `Enrolment application update — ${app.childFirstName} ${app.childLastName}`,
      html: parentEmailLayout(`
        <h2 style="margin:0 0 12px;color:#111827;font-size:18px;font-weight:600;">
          Enrolment Application Update
        </h2>
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
          Assalamu Alaikum ${parentName},
        </p>
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
          Unfortunately we are unable to approve the enrolment application for
          <strong>${app.childFirstName}</strong> at <strong>${app.service.name}</strong>
          at this time.
        </p>
        ${reasonBlock}
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
          Please contact your centre coordinator if you have any questions.
        </p>
        <p style="margin:16px 0 0;color:#9ca3af;font-size:13px;line-height:1.5;">
          Jazak Allahu Khairan,<br/>
          The Amana OSHC Team
        </p>
      `),
      type: "enrolment_declined",
      relatedId: applicationId,
      relatedType: "EnrolmentApplication",
    });
  } catch (err) {
    logger.error("Failed to send enrolment declined notification", {
      applicationId,
      err,
    });
  }
}
