import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { isNewsletterChaseWeek } from "@/lib/school-terms";
import { buildNewsletterChase, bundleChaseBody } from "@/lib/newsletter-chase";

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const now = new Date();
  const eligibility = isNewsletterChaseWeek(now);
  if (!eligibility.eligible || !eligibility.currentTerm || !eligibility.nextTerm || eligibility.weeksUntilTermEnd === null) {
    return NextResponse.json({ skipped: true, reason: "not_chase_week", eligibility });
  }

  // Lock per term-week so re-runs in the same chase window don't duplicate
  const periodKey = `${eligibility.currentTerm.year}-T${eligibility.currentTerm.number}-W${eligibility.weeksUntilTermEnd}`;
  const guard = await acquireCronLock(`newsletter-chase:${periodKey}`, "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const targetId = periodKey;

    const existing = await prisma.aiTaskDraft.findFirst({
      where: { source: "newsletter-chase", targetId, status: "ready" },
      select: { id: true },
    });
    if (existing) {
      await guard.complete({ skipped: true, reason: "already_drafted_for_period", periodKey });
      return NextResponse.json({ skipped: true, reason: "already_drafted_for_period", periodKey });
    }

    const akram = await prisma.user.findFirst({
      where: { role: "marketing", active: true },
      select: { id: true },
    });
    if (!akram) {
      await guard.complete({ skipped: true, reason: "no marketing user" });
      return NextResponse.json({ skipped: true, reason: "no marketing user" });
    }

    const result = await buildNewsletterChase({
      currentTerm: eligibility.currentTerm,
      nextTerm: eligibility.nextTerm,
      weeksUntilTermEnd: eligibility.weeksUntilTermEnd,
      now,
    });

    const toEmail = result.entries.filter((e) => !e.skipped);
    const draft = await prisma.aiTaskDraft.create({
      data: {
        source: "newsletter-chase",
        targetId,
        taskType: "communication",
        title: `Newsletter chase: ${result.termInfo.nextTermLabel} placements — ${toEmail.length} school${toEmail.length === 1 ? "" : "s"} to email`,
        content: bundleChaseBody(result),
        metadata: {
          kind: "newsletter_chase",
          periodKey,
          currentTerm: eligibility.currentTerm,
          nextTerm: eligibility.nextTerm,
          weeksUntilTermEnd: eligibility.weeksUntilTermEnd,
          entries: result.entries.map((e) => ({
            serviceId: e.serviceId,
            serviceName: e.serviceName,
            skipped: e.skipped,
            skipReason: e.skipReason ?? null,
          })),
        },
        status: "ready",
        model: "system",
      },
      select: { id: true },
    });

    await guard.complete({ draftId: draft.id, periodKey, toEmail: toEmail.length });
    return NextResponse.json({
      message: "Newsletter chase drafted",
      draftId: draft.id,
      periodKey,
      toEmail: toEmail.length,
      skipped: result.entries.filter((e) => e.skipped).length,
    });
  } catch (err) {
    logger.error("newsletter-placement-chase failed", { err });
    await guard.fail(err);
    throw err;
  }
});
