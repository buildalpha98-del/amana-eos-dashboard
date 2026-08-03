/**
 * GET /api/cron/card-expiry-reminders
 *
 * Daily — emails families whose card is about to expire, or just has.
 *
 * A card that lapses silently means a failed debit, an overdue balance
 * the family didn't know about, and a phone call from the office. Nobody
 * was warning them: nothing in the system looked at card expiry at all.
 *
 * Reads only the MASKED payment blob — expiry is stored readable there
 * precisely so this job never has to decrypt anyone's card number.
 *
 * Dedup: the keys already sent for the CURRENT expiry date are kept on
 * the enrolment's paymentDetails. Keying on the expiry date (not just the
 * key) means a family who updates their card gets a fresh cycle of
 * reminders rather than being permanently silenced.
 *
 * Auth: Bearer CRON_SECRET
 */
import { NextResponse } from "next/server";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { cardExpiryEmail } from "@/lib/email-templates/parent-account";
import { daysUntilExpiry, reminderDue } from "@/lib/card-expiry";

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("card-expiry-reminders", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  const submissions = await prisma.enrolmentSubmission.findMany({
    where: {
      paymentMethod: "credit_card",
      status: { notIn: ["draft", "rejected", "archived"] },
    },
    select: { id: true, primaryParent: true, paymentDetails: true },
    take: 5000,
  });

  const now = new Date();
  let sent = 0;
  let skipped = 0;

  for (const sub of submissions) {
    const details = (sub.paymentDetails ?? {}) as Record<string, unknown>;
    const expiryKey = `${details.expiryMonth ?? ""}/${details.expiryYear ?? ""}`;

    // Reminders already sent for THIS expiry date.
    const log = (details.expiryRemindersSent ?? {}) as Record<string, string[]>;
    const already = Array.isArray(log[expiryKey]) ? log[expiryKey] : [];

    const due = reminderDue(
      {
        expiryMonth: details.expiryMonth as string | null,
        expiryYear: details.expiryYear as string | null,
      },
      already,
      now,
    );
    if (!due) {
      skipped++;
      continue;
    }

    const parent = (sub.primaryParent ?? {}) as Record<string, unknown>;
    const email = typeof parent.email === "string" ? parent.email.trim() : "";
    if (!email) {
      skipped++;
      continue;
    }

    const days =
      daysUntilExpiry(
        {
          expiryMonth: details.expiryMonth as string | null,
          expiryYear: details.expiryYear as string | null,
        },
        now,
      ) ?? 0;

    try {
      const { subject, html } = await cardExpiryEmail({
        name:
          typeof parent.firstName === "string" && parent.firstName.trim()
            ? parent.firstName.trim()
            : "there",
        days,
        lastFour: (details.lastFour as string) ?? null,
        cardType: (details.cardType as string) ?? null,
      });
      await sendEmail({ to: email, subject, html });

      // Record the send only AFTER it succeeded — marking first would
      // silence a family whose email bounced.
      await prisma.enrolmentSubmission.update({
        where: { id: sub.id },
        data: {
          paymentDetails: {
            ...details,
            expiryRemindersSent: { ...log, [expiryKey]: [...already, due] },
          },
        },
      });
      sent++;
    } catch (err) {
      // One bad address must not stop the run for everyone else.
      logger.warn("Card expiry reminder failed to send", {
        enrolmentId: sub.id,
        error: err instanceof Error ? err.message : String(err),
      });
      skipped++;
    }
  }

  logger.info("Card expiry reminders", {
    scanned: submissions.length,
    sent,
    skipped,
  });

  return NextResponse.json({ ok: true, scanned: submissions.length, sent, skipped });
});
