/**
 * GET /api/cron/card-expiry-reminders
 *
 * Daily — tells the OWNER and ADMINS when a family's old card is about to
 * expire, or just has, so someone can ring the family and ask for bank
 * details instead.
 *
 * 2026-10-21 (Daniel): this used to email the PARENT asking them to update
 * their card. Cards can't be stored any more (security brief batch 2 —
 * direct debit only), so that email asked families for something the system
 * would refuse. Now head office is notified (in-app + push via notifyUsers)
 * and makes the call; the family is asked for bank details, never a card.
 *
 * Reads only the MASKED payment blob (expiry is stored readable there), so
 * this job never decrypts anything.
 *
 * Dedup: the keys already notified for the CURRENT expiry date are kept on
 * the enrolment's paymentDetails (30-day, 7-day, expired — never daily).
 *
 * Auth: Bearer CRON_SECRET
 */
import { NextResponse } from "next/server";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { notifyUsers } from "@/lib/notify-user";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { BANK_DETAILS_ROLES } from "@/lib/payment-details";
import { daysUntilExpiry, expiryPhrase, reminderDue } from "@/lib/card-expiry";

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
  let notified = 0;
  let skipped = 0;

  // The people who can see bank details are the people who chase them.
  const recipients = (
    await prisma.user.findMany({
      where: { active: true, isCentreAccount: false, role: { in: [...BANK_DETAILS_ROLES] } },
      select: { id: true },
    })
  ).map((u) => u.id);

  for (const sub of submissions) {
    const details = (sub.paymentDetails ?? {}) as Record<string, unknown>;
    const card = {
      expiryMonth: details.expiryMonth as string | null,
      expiryYear: details.expiryYear as string | null,
    };
    const expiryKey = `${details.expiryMonth ?? ""}/${details.expiryYear ?? ""}`;

    // Notifications already sent for THIS expiry date.
    const log = (details.expiryRemindersSent ?? {}) as Record<string, string[]>;
    const already = Array.isArray(log[expiryKey]) ? log[expiryKey] : [];

    const due = reminderDue(card, already, now);
    if (!due || recipients.length === 0) {
      skipped++;
      continue;
    }

    const parent = (sub.primaryParent ?? {}) as Record<string, unknown>;
    const family =
      [parent.firstName, parent.surname].filter((v) => typeof v === "string" && v.trim()).join(" ") || "A family";
    const days = daysUntilExpiry(card, now) ?? 0;
    const cardLabel = `${(details.cardType as string) || "Card"} ending ${(details.lastFour as string) || "••••"}`;

    try {
      await notifyUsers(prisma, recipients, {
        type: NOTIFICATION_TYPES.CARD_EXPIRY,
        title: `${family}: ${cardLabel} ${expiryPhrase(days)}`,
        body: "Old card record. Call the family and ask for their bank details for direct debit — cards can't be stored any more.",
        link: `/enrolments?id=${sub.id}`,
      });

      // Record only AFTER the notification went out.
      await prisma.enrolmentSubmission.update({
        where: { id: sub.id },
        data: {
          paymentDetails: {
            ...details,
            expiryRemindersSent: { ...log, [expiryKey]: [...already, due] },
          },
        },
      });
      notified++;
    } catch (err) {
      // One failure must not stop the run for everyone else.
      logger.warn("Card expiry notification failed", {
        enrolmentId: sub.id,
        error: err instanceof Error ? err.message : String(err),
      });
      skipped++;
    }
  }

  logger.info("Card expiry notifications", {
    scanned: submissions.length,
    notified,
    skipped,
  });

  return NextResponse.json({ ok: true, scanned: submissions.length, notified, skipped });
});
