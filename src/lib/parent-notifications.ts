/**
 * Parent portal notification triggers.
 *
 * Call these from staff-facing API routes when events occur.
 * They look up the parent email from the relevant records and send via Resend.
 * All functions are fire-and-forget — they log errors but don't throw.
 */

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import {
  bookingConfirmedEmail,
  bookingCancelledEmail,
  newStatementEmail,
  newMessageReplyEmail,
  newChildPostEmail,
} from "@/lib/email-templates/parent-notifications";

// ── In-App Notification Helper ─────────────────────────

async function createInAppNotification(data: {
  parentEmail: string;
  type: string;
  title: string;
  body: string;
  link: string;
}) {
  try {
    await prisma.parentNotification.create({ data });
  } catch (err) {
    logger.error("Failed to create in-app notification", { ...data, err });
  }
}

// ── Booking Confirmed ───────────────────────────────────

export async function notifyBookingConfirmed(bookingId: string) {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        child: {
          select: {
            firstName: true,
            enrolment: {
              select: { primaryParent: true },
            },
          },
        },
        service: { select: { name: true } },
      },
    });
    if (!booking?.child.enrolment) return;

    const parent = booking.child.enrolment.primaryParent as Record<string, unknown> | null;
    const email = parent?.email as string | undefined;
    const name = parent?.firstName as string | undefined;
    if (!email) return;

    const template = bookingConfirmedEmail({
      parentName: name ?? "Parent",
      childName: booking.child.firstName,
      date: booking.date.toISOString(),
      sessionType: booking.sessionType,
      serviceName: booking.service.name,
    });

    await sendEmail({ to: email, ...template });
    await createInAppNotification({
      parentEmail: email,
      type: "booking",
      title: "Booking Confirmed",
      body: `${booking.child.firstName}'s booking has been confirmed.`,
      link: "/parent/bookings",
    });
  } catch (err) {
    logger.error("Failed to send booking confirmed notification", { bookingId, err });
  }
}

// ── Booking Cancelled ───────────────────────────────────

export async function notifyBookingCancelled(bookingId: string) {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        child: {
          select: {
            firstName: true,
            enrolment: {
              select: { primaryParent: true },
            },
          },
        },
        service: { select: { name: true } },
      },
    });
    if (!booking?.child.enrolment) return;

    const parent = booking.child.enrolment.primaryParent as Record<string, unknown> | null;
    const email = parent?.email as string | undefined;
    const name = parent?.firstName as string | undefined;
    if (!email) return;

    const template = bookingCancelledEmail({
      parentName: name ?? "Parent",
      childName: booking.child.firstName,
      date: booking.date.toISOString(),
      sessionType: booking.sessionType,
      serviceName: booking.service.name,
    });

    await sendEmail({ to: email, ...template });
    await createInAppNotification({
      parentEmail: email,
      type: "booking",
      title: "Booking Cancelled",
      body: `${booking.child.firstName}'s booking has been cancelled.`,
      link: "/parent/bookings",
    });
  } catch (err) {
    logger.error("Failed to send booking cancelled notification", { bookingId, err });
  }
}

// ── New Statement ───────────────────────────────────────

export async function notifyNewStatement(statementId: string) {
  try {
    const statement = await prisma.statement.findUnique({
      where: { id: statementId },
      include: {
        contact: { select: { email: true, firstName: true } },
      },
    });
    if (!statement) return;

    const template = newStatementEmail({
      parentName: statement.contact.firstName ?? "Parent",
      periodStart: statement.periodStart.toISOString(),
      periodEnd: statement.periodEnd.toISOString(),
      totalFees: statement.totalFees,
      totalCcs: statement.totalCcs,
      gapFee: statement.gapFee,
    });

    await sendEmail({ to: statement.contact.email, ...template });
  } catch (err) {
    logger.error("Failed to send new statement notification", { statementId, err });
  }
}

// ── New Message Reply (staff → parent) ──────────────────

export async function notifyMessageReply(ticketId: string, messageBody: string, staffName: string) {
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        parentContact: { select: { email: true, firstName: true } },
      },
    });
    if (!ticket?.parentContact) return;

    const template = newMessageReplyEmail({
      parentName: ticket.parentContact.firstName ?? "Parent",
      subject: ticket.subject ?? "Your conversation",
      staffName,
      previewText: messageBody,
      ticketId: ticket.id,
    });

    await sendEmail({ to: ticket.parentContact.email, ...template });
    await createInAppNotification({
      parentEmail: ticket.parentContact.email,
      type: "message",
      title: `Reply: ${ticket.subject ?? "Conversation"}`,
      body: `${staffName} replied to your message.`,
      link: `/parent/messages/${ticket.id}`,
    });
  } catch (err) {
    logger.error("Failed to send message reply notification", { ticketId, err });
  }
}

// ── New Child Post (observation/announcement) ──────────

export async function notifyParentNewPost(
  postId: string,
  postTitle: string,
  postType: string,
  childIds: string[],
) {
  try {
    if (childIds.length === 0) return;

    // Find parent emails for all tagged children
    const children = await prisma.child.findMany({
      where: { id: { in: childIds } },
      select: {
        firstName: true,
        enrolment: { select: { primaryParent: true } },
      },
    });

    // Deduplicate by email (parent with multiple tagged children gets one email)
    const parentMap = new Map<string, { name: string; childNames: string[] }>();

    for (const child of children) {
      const pp = child.enrolment?.primaryParent as Record<string, unknown> | null;
      const email = pp?.email as string | undefined;
      const name = pp?.firstName as string | undefined;
      if (!email) continue;

      const existing = parentMap.get(email);
      if (existing) {
        existing.childNames.push(child.firstName);
      } else {
        parentMap.set(email, { name: name ?? "Parent", childNames: [child.firstName] });
      }
    }

    const typeLabel = postType === "announcement" ? "Announcement" : postType === "reminder" ? "Reminder" : "Observation";

    for (const [email, { name, childNames }] of parentMap) {
      const template = newChildPostEmail({
        parentName: name,
        childNames,
        postTitle,
        postType: typeLabel,
      });

      await sendEmail({ to: email, ...template }).catch((err) =>
        logger.error("Failed to send post notification email", { email, err }),
      );

      await createInAppNotification({
        parentEmail: email,
        type: "post",
        title: `New ${typeLabel}`,
        body: postTitle,
        link: "/parent",
      });
    }
  } catch (err) {
    logger.error("Failed to send post notifications", { postId, err });
  }
}
