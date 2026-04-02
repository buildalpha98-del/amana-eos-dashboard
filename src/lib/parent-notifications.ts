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
} from "@/lib/email-templates/parent-notifications";

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
  } catch (err) {
    logger.error("Failed to send message reply notification", { ticketId, err });
  }
}
