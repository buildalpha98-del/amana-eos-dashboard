import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { getTermsForYear, hasExactTermDates } from "@/lib/school-terms";
import {
  createTermPackForService,
  notifyTermPackCreated,
} from "@/lib/term-pack";

/**
 * Weekly term autopilot (Mondays) — when the next school term starts within
 * 4 weeks, creates a pre-briefed creative-request pack (poster, flyer,
 * countdown tiles, newsletter headers) for every active service, then sends
 * ONE digest notification per active marketing user.
 *
 * Idempotent twice over: `acquireCronLock("term-autopilot", "weekly")` guards
 * double-runs within a week, and the `[auto:term-pack:<year>-T<term>]` purpose
 * marker is checked PER SERVICE inside the loop, so a crashed run resumes the
 * remaining services next week.
 *
 * Term dates come from `@/lib/school-terms` (never the term-calendar route's
 * duplicate). Dates are server-local (Vercel = UTC) — a few hours of skew on
 * a 4-week window is acceptable.
 */

const WINDOW_MS = 28 * 24 * 60 * 60 * 1000; // 4 weeks

export const GET = withApiHandler(async (req) => {
  const authError = verifyCronSecret(req);
  if (authError) return authError.error;

  const guard = await acquireCronLock("term-autopilot", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ skipped: true, reason: guard.reason });
  }

  try {
    const now = new Date();
    const horizon = new Date(now.getTime() + WINDOW_MS);

    // Next term starting in the future AND within 4 weeks — search this year
    // then next (Term 1 of next year is in range from early December).
    const candidates = [
      ...getTermsForYear(now.getFullYear()),
      ...getTermsForYear(now.getFullYear() + 1),
    ];
    const nextTerm = candidates.find(
      (t) => t.startsOn > now && t.startsOn <= horizon,
    );
    if (!nextTerm) {
      await guard.complete({ skipped: "no-term-window" });
      return NextResponse.json({ ok: true, skipped: "no-term-window" });
    }

    if (!hasExactTermDates(nextTerm.year)) {
      logger.warn("term-autopilot using approximate term dates", {
        year: nextTerm.year,
      });
    }

    // Requests need an owner: the oldest active marketing user.
    const requester = await prisma.user.findFirst({
      where: { role: "marketing", active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!requester) {
      logger.error("term-autopilot: no active marketing user to own the pack", {
        term: nextTerm.term,
        year: nextTerm.year,
      });
      await guard.complete({ skipped: "no-marketing-user" });
      return NextResponse.json({ ok: true, skipped: "no-marketing-user" });
    }

    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    // SEQUENTIAL — request numbers are count-based; parallel packs would
    // mint duplicate numbers and exhaust the retry budget.
    let created = 0;
    for (const service of services) {
      created += await createTermPackForService(prisma, {
        year: nextTerm.year,
        term: nextTerm.term,
        termStart: nextTerm.startsOn,
        service,
        requestedById: requester.id,
      });
    }

    if (created > 0) {
      await notifyTermPackCreated(prisma, {
        count: created,
        term: nextTerm.term,
        year: nextTerm.year,
      });
    }

    await guard.complete({ created, services: services.length });
    return NextResponse.json({
      ok: true,
      created,
      services: services.length,
      term: `${nextTerm.year}-T${nextTerm.term}`,
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("term-autopilot cron failed", { err });
    return NextResponse.json({ error: "term-autopilot failed" }, { status: 500 });
  }
});
