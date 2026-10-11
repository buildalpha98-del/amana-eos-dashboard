/**
 * Billing email notifications — statement issued, payment received, overdue.
 * Send helpers log failures; preparation throws so durable workers can recover.
 */

import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/notifications/sendEmail";
import { parentEmailLayout, buttonHtml, escapeHtml } from "@/lib/email-templates/base";
import { logger } from "@/lib/logger";
import { FROM_EMAIL, type SendEmailParams } from "@/lib/email";

const PARENT_PORTAL_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://amanaoshc.company";

const methodLabels: Record<string, string> = {
  bank_transfer: "bank transfer",
  cash: "cash",
  card: "card",
  direct_debit: "direct debit",
  other: "other",
};

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatWeekOf(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
  });
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// ─── Statement Issued ───────────────────────────────────────

export async function prepareStatementIssuedEmail(statementId: string): Promise<SendEmailParams> {
  const statement = await prisma.statement.findUniqueOrThrow({
    where: { id: statementId },
    include: { contact: { select: { firstName: true, lastName: true, email: true } }, service: { select: { name: true } } },
  });
  const { contact, service } = statement;
  if (!contact.email) throw new Error("MISSING_RECIPIENT");
  const name = escapeHtml(contact.firstName || "Parent");
  const weekLabel = formatWeekOf(statement.periodStart);

  const pdfButton = statement.pdfUrl
    ? buttonHtml("Download Statement PDF", escapeHtml(statement.pdfUrl))
    : "";

  const html = parentEmailLayout(`
  <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
    Assalamu Alaikum ${name}
  </h2>
  <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
    Your statement for <strong>${escapeHtml(service.name)}</strong> is ready.
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <tr>
      <td style="padding:12px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Week of</td>
      <td style="padding:12px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;font-weight:600;text-align:right;">${weekLabel}</td>
    </tr>
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Service</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;text-align:right;">${escapeHtml(service.name)}</td>
    </tr>
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Gap fee</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;font-weight:600;text-align:right;">${formatCurrency(statement.gapFee)}</td>
    </tr>
    ${
      statement.dueDate
        ? `<tr>
      <td style="padding:12px 16px;color:#6b7280;font-size:13px;">Due date</td>
      <td style="padding:12px 16px;color:#111827;font-size:14px;text-align:right;">${formatDate(statement.dueDate)}</td>
    </tr>`
        : ""
    }
  </table>
  ${pdfButton}
  ${buttonHtml("View in Parent Portal", escapeHtml(`${PARENT_PORTAL_URL}/parent/billing`))}
  <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
    Jazak Allahu Khairan,<br/>
    <strong>The Amana OSHC Team</strong>
  </p>
  `);

  return { from: FROM_EMAIL, to: [contact.email], subject: `Your Amana OSHC statement is ready — week of ${weekLabel}`, html };
}

export async function sendStatementIssuedNotification(statementId: string): Promise<void> {
  try {
    const payload = await prepareStatementIssuedEmail(statementId);
    await sendNotificationEmail({ ...payload, to: (payload.to as string[])[0], type: "statement_issued", relatedId: statementId, relatedType: "Statement" });
  } catch (error) {
    logger.error("Billing notification: failed to send statement issued email", { statementId, error });
  }
}

// ─── Payment Received ───────────────────────────────────────

export async function sendPaymentReceivedNotification(
  paymentId: string,
): Promise<void> {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        contact: { select: { firstName: true, lastName: true, email: true } },
        statement: { select: { balance: true } },
      },
    });

    if (!payment) {
      logger.warn("Billing notification: payment not found", { paymentId });
      return;
    }

    const { contact } = payment;
    if (!contact.email) {
      logger.warn("Billing notification: contact has no email", {
        paymentId,
        contactId: payment.contactId,
      });
      return;
    }

    const name = contact.firstName || "Parent";
    const methodLabel = methodLabels[payment.method] || payment.method;

    const referenceRow = payment.reference
      ? `<tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Reference</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;text-align:right;">${payment.reference}</td>
      </tr>`
      : "";

    const balanceRow = payment.statement
      ? `<tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;">Current balance</td>
        <td style="padding:12px 16px;color:#111827;font-size:14px;font-weight:600;text-align:right;">${formatCurrency(payment.statement.balance)}</td>
      </tr>`
      : "";

    const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Assalamu Alaikum ${name}
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We've received your payment. Thank you!
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Amount</td>
        <td style="padding:12px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;font-weight:600;text-align:right;">${formatCurrency(payment.amount)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Method</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;text-align:right;">${methodLabel}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;${referenceRow || balanceRow ? "border-bottom:1px solid #e5e7eb;" : ""}color:#6b7280;font-size:13px;">Date</td>
        <td style="padding:12px 16px;${referenceRow || balanceRow ? "border-bottom:1px solid #e5e7eb;" : ""}color:#111827;font-size:14px;text-align:right;">${formatDate(payment.receivedAt)}</td>
      </tr>
      ${referenceRow}
      ${balanceRow}
    </table>
    ${buttonHtml("View in Parent Portal", `${PARENT_PORTAL_URL}/parent/billing`)}
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Jazak Allahu Khairan,<br/>
      <strong>The Amana OSHC Team</strong>
    </p>
  `);

    await sendNotificationEmail({
      to: contact.email,
      toName: name,
      subject: `Payment received — ${formatCurrency(payment.amount)}`,
      html,
      type: "payment_received",
      relatedId: paymentId,
      relatedType: "Payment",
    });
  } catch (error) {
    logger.error("Billing notification: failed to send payment received email", {
      paymentId,
      error,
    });
  }
}

// ─── Overdue Statement ──────────────────────────────────────

export async function sendOverdueStatementNotification(
  statementId: string,
): Promise<void> {
  try {
    const statement = await prisma.statement.findUnique({
      where: { id: statementId },
      include: {
        contact: { select: { firstName: true, lastName: true, email: true } },
        service: { select: { name: true } },
      },
    });

    if (!statement) {
      logger.warn("Billing notification: statement not found", { statementId });
      return;
    }

    const { contact, service } = statement;
    if (!contact.email) {
      logger.warn("Billing notification: contact has no email", {
        statementId,
        contactId: statement.contactId,
      });
      return;
    }

    const name = contact.firstName || "Parent";

    const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Assalamu Alaikum ${name}
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We'd like to let you know that your account with <strong>${service.name}</strong> has an outstanding balance.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;background:#fef2f2;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Outstanding balance</td>
        <td style="padding:12px 16px;background:#fef2f2;border-bottom:1px solid #e5e7eb;color:#dc2626;font-size:14px;font-weight:600;text-align:right;">${formatCurrency(statement.balance)}</td>
      </tr>
      ${
        statement.dueDate
          ? `<tr>
        <td style="padding:12px 16px;color:#6b7280;font-size:13px;">Due date</td>
        <td style="padding:12px 16px;color:#111827;font-size:14px;text-align:right;">${formatDate(statement.dueDate)}</td>
      </tr>`
          : ""
      }
    </table>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you've already made a payment, please disregard this notice. Otherwise, please contact your service coordinator to arrange payment or discuss a payment plan.
    </p>
    ${buttonHtml("View in Parent Portal", `${PARENT_PORTAL_URL}/parent/billing`)}
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Jazak Allahu Khairan,<br/>
      <strong>The Amana OSHC Team</strong>
    </p>
  `);

    await sendNotificationEmail({
      to: contact.email,
      toName: name,
      subject: "Overdue balance — Amana OSHC",
      html,
      type: "statement_overdue",
      relatedId: statementId,
      relatedType: "Statement",
    });
  } catch (error) {
    logger.error(
      "Billing notification: failed to send overdue statement email",
      { statementId, error },
    );
  }
}
