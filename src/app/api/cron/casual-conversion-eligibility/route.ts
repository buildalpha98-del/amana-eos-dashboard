/**
 * GET /api/cron/casual-conversion-eligibility
 *
 * Weekly cron — Monday 07:00 AEST (Sunday 21:00 UTC). Finds active
 * casual staff who:
 *   - have crossed the 6mo (or 12mo for small biz) tenure threshold
 *   - have no pending conversion election
 *   - have no recent decline in cooldown
 *
 * For each newly-flagged casual, creates an in-app notification to
 * each admin / owner so they can proactively offer conversion under
 * Fair Work Act s66B (Closing Loopholes No. 2 Act 2024). Per-(admin,
 * subject) deduped at the 60-day window — if last week's nudge was
 * ignored, we won't ping again for ~2 months.
 *
 * Why proactive? s66B is employee-driven — the law doesn't oblige
 * the employer to offer first. But the most defensible position is
 * to surface the option, not wait for staff to learn about their
 * rights and ask. This cron closes the "admin had to remember to
 * check" gap from the conversion workflow shipped earlier today.
 *
 * Auth: Bearer CRON_SECRET.
 * Idempotency: acquireCronLock("casual-conversion-eligibility", "weekly").
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { computeEligibility } from "@/lib/casual-conversion";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";

const DEDUP_WINDOW_DAYS = 60;

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock(
    "casual-conversion-eligibility",
    "weekly",
  );
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    // Recipients: owners + admins + head_office. We don't ping
    // `member` (Director of Service / coordinator) by default — they
    // can see the eligibility status on the staff profile but don't
    // own the conversion decision.
    const recipients = await prisma.user.findMany({
      where: { active: true, role: { in: ["owner", "head_office", "admin"] } },
      select: { id: true, name: true, email: true },
    });
    if (recipients.length === 0) {
      await guard.complete({ recipientsCount: 0, eligibleSubjects: 0 });
      return NextResponse.json({
        skipped: true,
        reason: "No admin recipients to notify",
      });
    }

    // Candidate subjects: active casuals only. Filter by the latest
    // active contract — done inside computeEligibility but we can
    // pre-narrow to reduce the work loop.
    const candidates = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });

    const dedupCutoff = new Date(
      Date.now() - DEDUP_WINDOW_DAYS * 86400000,
    );

    let eligibleCount = 0;
    let notificationsCreated = 0;
    let skippedDuplicates = 0;
    const errors: string[] = [];

    for (const subject of candidates) {
      let eligibility;
      try {
        eligibility = await computeEligibility(subject.id);
      } catch (err) {
        errors.push(
          `Eligibility check failed for ${subject.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        continue;
      }
      if (!eligibility.eligible) continue;
      eligibleCount += 1;

      // Per-(recipient, subject) dedup at 60 days. We encode the
      // subject in the notification link so we can query by it.
      const subjectLink = `/staff/${subject.id}#section-employment`;

      for (const recipient of recipients) {
        const existing = await prisma.userNotification.findFirst({
          where: {
            userId: recipient.id,
            type: NOTIFICATION_TYPES.CASUAL_CONVERSION_ELIGIBLE,
            link: subjectLink,
            createdAt: { gte: dedupCutoff },
          },
          select: { id: true },
        });
        if (existing) {
          skippedDuplicates += 1;
          continue;
        }

        try {
          await prisma.userNotification.create({
            data: {
              userId: recipient.id,
              type: NOTIFICATION_TYPES.CASUAL_CONVERSION_ELIGIBLE,
              title: "Casual conversion eligible",
              body: `${subject.name} has crossed the ${eligibility.thresholdMonths}-month casual tenure threshold (${eligibility.tenureMonths.toFixed(1)}mo). Consider offering Fair Work s66B conversion.`,
              link: subjectLink,
            },
          });
          notificationsCreated += 1;
        } catch (err) {
          errors.push(
            `Notification create failed (recipient=${recipient.id} subject=${subject.id}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    const summary = {
      candidatesChecked: candidates.length,
      eligibleSubjects: eligibleCount,
      recipientsCount: recipients.length,
      notificationsCreated,
      skippedDuplicates,
      errorCount: errors.length,
    };

    logger.info("Casual conversion eligibility cron complete", summary);
    if (errors.length > 0) {
      logger.warn("Casual conversion eligibility cron — errors", { errors });
    }

    await guard.complete(summary);
    return NextResponse.json(summary);
  } catch (err) {
    await guard.fail(err instanceof Error ? err : new Error(String(err)));
    logger.error("Casual conversion eligibility cron failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
});
