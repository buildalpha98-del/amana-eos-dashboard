import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/notifications/sendEmail";
import { parentEmailLayout, buttonHtml } from "@/lib/email-templates/base";
import { logger } from "@/lib/logger";

const PORTAL_URL = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

function sessionLabel(sessionType: string): string {
  return sessionType === "bsc"
    ? "Before School Care"
    : sessionType === "asc"
      ? "After School Care"
      : "Vacation Care";
}

function formatDateAU(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
}

async function getServiceCoordinatorEmail(serviceId: string): Promise<{ email: string; name: string } | null> {
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

async function getParentForBooking(bookingId: string): Promise<{
  email: string;
  firstName: string;
  childName: string;
  serviceName: string;
  date: Date;
  sessionType: string;
} | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      date: true,
      sessionType: true,
      child: {
        select: {
          firstName: true,
          surname: true,
          enrolment: { select: { primaryParent: true } },
        },
      },
      service: { select: { name: true } },
      requestedBy: { select: { email: true, firstName: true } },
    },
  });

  if (!booking) return null;

  let email: string | null = null;
  let firstName = "Parent";

  if (booking.requestedBy?.email) {
    email = booking.requestedBy.email;
    firstName = booking.requestedBy.firstName || "Parent";
  } else {
    const pp = booking.child.enrolment?.primaryParent as Record<string, unknown> | null;
    if (pp?.email) {
      email = pp.email as string;
      firstName = (pp.firstName as string) || "Parent";
    }
  }

  if (!email) return null;

  return {
    email,
    firstName,
    childName: `${booking.child.firstName} ${booking.child.surname}`,
    serviceName: booking.service.name,
    date: booking.date,
    sessionType: booking.sessionType,
  };
}

// ── 1. Booking Request Notification (to staff) ─────────────

export async function sendBookingRequestNotification(bookingId: string): Promise<void> {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        date: true,
        sessionType: true,
        serviceId: true,
        child: { select: { firstName: true, surname: true } },
        service: { select: { name: true } },
        requestedBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (!booking) return;

    const coordinator = await getServiceCoordinatorEmail(booking.serviceId);
    if (!coordinator) {
      logger.warn("No coordinator email for booking request notification", { bookingId });
      return;
    }

    const childName = `${booking.child.firstName} ${booking.child.surname}`;
    const formattedDate = formatDateAU(booking.date);
    const session = sessionLabel(booking.sessionType);
    const parentName = booking.requestedBy
      ? `${booking.requestedBy.firstName || ""} ${booking.requestedBy.lastName || ""}`.trim() || "A parent"
      : "A parent";

    await sendNotificationEmail({
      to: coordinator.email,
      toName: coordinator.name,
      subject: `New casual booking request — ${childName} on ${formattedDate}`,
      html: parentEmailLayout(`
        <h2 style="color: #004E64; margin: 0 0 16px;">New Booking Request</h2>
        <p style="margin: 0 0 12px; color: #374151; font-size: 15px;">
          ${parentName} has requested a casual <strong>${session}</strong> booking for
          <strong>${childName}</strong> on <strong>${formattedDate}</strong>
          at ${booking.service.name}.
        </p>
        <p style="margin: 0 0 16px; color: #374151; font-size: 15px;">
          Please log in to review and approve.
        </p>
        ${buttonHtml("Review Booking Requests", `${PORTAL_URL}/bookings`)}
      `),
      type: "booking_requested",
      relatedId: bookingId,
      relatedType: "Booking",
    });
  } catch (err) {
    logger.error("Failed to send booking request notification", { bookingId, err });
  }
}

// ── 2. Booking Confirmed Notification (to parent) ──────────

export async function sendBookingConfirmedNotification(bookingId: string): Promise<void> {
  try {
    const data = await getParentForBooking(bookingId);
    if (!data) {
      logger.warn("No parent email for booking confirmed notification", { bookingId });
      return;
    }

    const formattedDate = formatDateAU(data.date);
    const session = sessionLabel(data.sessionType);

    await sendNotificationEmail({
      to: data.email,
      toName: data.firstName,
      subject: `Booking confirmed — ${data.childName} on ${formattedDate}`,
      html: parentEmailLayout(`
        <h2 style="color: #004E64; margin: 0 0 16px;">Booking Confirmed</h2>
        <p style="margin: 0 0 12px; color: #374151; font-size: 15px;">
          Assalamu Alaikum ${data.firstName},
        </p>
        <p style="margin: 0 0 12px; color: #374151; font-size: 15px;">
          Your casual <strong>${session}</strong> booking for <strong>${data.childName}</strong>
          on <strong>${formattedDate}</strong> at ${data.serviceName} has been confirmed.
        </p>
        <p style="margin: 0; color: #374151; font-size: 15px;">
          Jazak Allahu Khairan,<br/>
          <strong>The Amana OSHC Team</strong>
        </p>
        ${buttonHtml("View Bookings", `${PORTAL_URL}/parent/bookings`)}
      `),
      type: "booking_confirmed",
      relatedId: bookingId,
      relatedType: "Booking",
    });
  } catch (err) {
    logger.error("Failed to send booking confirmed notification", { bookingId, err });
  }
}

// ── 3. Booking Declined Notification (to parent) ───────────

export async function sendBookingDeclinedNotification(bookingId: string, reason?: string): Promise<void> {
  try {
    const data = await getParentForBooking(bookingId);
    if (!data) {
      logger.warn("No parent email for booking declined notification", { bookingId });
      return;
    }

    const formattedDate = formatDateAU(data.date);
    const session = sessionLabel(data.sessionType);
    const reasonBlock = reason
      ? `<p style="margin: 0 0 12px; color: #374151; font-size: 15px;"><strong>Reason:</strong> ${reason}</p>`
      : "";

    await sendNotificationEmail({
      to: data.email,
      toName: data.firstName,
      subject: `Booking update — ${data.childName} on ${formattedDate}`,
      html: parentEmailLayout(`
        <h2 style="color: #004E64; margin: 0 0 16px;">Booking Update</h2>
        <p style="margin: 0 0 12px; color: #374151; font-size: 15px;">
          Assalamu Alaikum ${data.firstName},
        </p>
        <p style="margin: 0 0 12px; color: #374151; font-size: 15px;">
          Unfortunately we are unable to confirm the casual ${session} booking for
          <strong>${data.childName}</strong> on <strong>${formattedDate}</strong>.
        </p>
        ${reasonBlock}
        <p style="margin: 0 0 12px; color: #7c7c8a; font-size: 14px;">
          Please contact your centre if you have any questions.
        </p>
        <p style="margin: 0; color: #374151; font-size: 15px;">
          Jazak Allahu Khairan,<br/>
          <strong>The Amana OSHC Team</strong>
        </p>
        ${buttonHtml("View Bookings", `${PORTAL_URL}/parent/bookings`)}
      `),
      type: "booking_declined",
      relatedId: bookingId,
      relatedType: "Booking",
    });
  } catch (err) {
    logger.error("Failed to send booking declined notification", { bookingId, err });
  }
}

// ── 4. Absence Confirmation Notification (to parent) ───────

export async function sendAbsenceConfirmationNotification(absenceId: string): Promise<void> {
  try {
    const absence = await prisma.absence.findUnique({
      where: { id: absenceId },
      select: {
        date: true,
        sessionType: true,
        child: {
          select: {
            firstName: true,
            surname: true,
            enrolment: { select: { primaryParent: true } },
          },
        },
        service: { select: { name: true } },
      },
    });

    if (!absence) return;

    const pp = absence.child.enrolment?.primaryParent as Record<string, unknown> | null;
    if (!pp?.email) {
      logger.warn("No parent email for absence confirmation", { absenceId });
      return;
    }

    const email = pp.email as string;
    const firstName = (pp.firstName as string) || "Parent";
    const childName = `${absence.child.firstName} ${absence.child.surname}`;
    const formattedDate = formatDateAU(absence.date);
    const session = sessionLabel(absence.sessionType);

    await sendNotificationEmail({
      to: email,
      toName: firstName,
      subject: `Absence recorded — ${childName} on ${formattedDate}`,
      html: parentEmailLayout(`
        <h2 style="color: #004E64; margin: 0 0 16px;">Absence Recorded</h2>
        <p style="margin: 0 0 12px; color: #374151; font-size: 15px;">
          Assalamu Alaikum ${firstName},
        </p>
        <p style="margin: 0 0 12px; color: #374151; font-size: 15px;">
          We have recorded <strong>${childName}</strong>'s absence for
          <strong>${session}</strong> on <strong>${formattedDate}</strong>.
        </p>
        <p style="margin: 0 0 12px; color: #7c7c8a; font-size: 14px;">
          If this was submitted in error, please contact your centre.
        </p>
        <p style="margin: 0; color: #374151; font-size: 15px;">
          Jazak Allahu Khairan,<br/>
          <strong>The Amana OSHC Team</strong>
        </p>
      `),
      type: "absence_confirmed",
      relatedId: absenceId,
      relatedType: "Absence",
    });
  } catch (err) {
    logger.error("Failed to send absence confirmation notification", { absenceId, err });
  }
}
