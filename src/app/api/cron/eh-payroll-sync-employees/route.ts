/**
 * GET /api/cron/eh-payroll-sync-employees
 *
 * Daily cron — refreshes the mapping between dashboard Users and EH
 * Payroll Employees. New starters appear in EH after onboarding;
 * email changes happen; people leave. This run keeps
 * `User.employmentHeroEmployeeId` honest.
 *
 * Matching tiers (a User keeps its current mapping if still valid):
 *   1. Already-mapped users whose EH employee is still Active → no-op.
 *   2. Already-mapped users whose EH employee is Terminated → clear mapping.
 *   3. Unmapped active users → try email match (case-insensitive trim).
 *
 * Unmatched users are reported in the response and logged so an admin
 * can fix them via the manual override UI in Settings → Team. We do NOT
 * try fuzzy name match in cron — too easy to silently match the wrong
 * person; admins do that step.
 *
 * Auth: Bearer CRON_SECRET.
 * Idempotency: acquireCronLock("eh-payroll-sync-employees", "daily").
 *
 * Scheduled in `vercel.json` at 06:30 UTC (16:30 AEST) so it runs before
 * the morning standup admin pulls headcount.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { isConfigured, listEmployees } from "@/lib/eh-payroll";

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  if (!isConfigured()) {
    return NextResponse.json(
      { skipped: true, reason: "EH Payroll not configured" },
      { status: 200 },
    );
  }

  const guard = await acquireCronLock("eh-payroll-sync-employees", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  const startMs = Date.now();
  let employees;
  try {
    employees = await listEmployees();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("EH Payroll employee sync: list failed", { error: msg });
    await guard.fail(new Error(`listEmployees failed: ${msg}`));
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Build an email → employee map for O(1) lookup. Skip employees with
  // no email — they can't be auto-matched, full stop. Lowercase + trim
  // to defuse case/whitespace differences between systems.
  const byEmail = new Map<string, (typeof employees)[number]>();
  const ehById = new Map<number, (typeof employees)[number]>();
  for (const e of employees) {
    ehById.set(e.id, e);
    if (e.email) {
      byEmail.set(e.email.toLowerCase().trim(), e);
    }
  }

  // All active dashboard users plus already-mapped inactive ones (so we
  // can clear stale links on terminated staff).
  const users = await prisma.user.findMany({
    where: {
      OR: [{ active: true }, { employmentHeroEmployeeId: { not: null } }],
    },
    select: {
      id: true,
      email: true,
      active: true,
      employmentHeroEmployeeId: true,
    },
  });

  let unchanged = 0;
  let newlyMapped = 0;
  let cleared = 0;
  const unmatched: Array<{ userId: string; email: string }> = [];

  for (const u of users) {
    // Tier 1: already mapped — verify the EH record still exists and is
    // Active. Terminated employees get their mapping cleared.
    if (u.employmentHeroEmployeeId !== null) {
      const eh = ehById.get(u.employmentHeroEmployeeId);
      if (!eh || eh.status !== "Active") {
        await prisma.user.update({
          where: { id: u.id },
          data: { employmentHeroEmployeeId: null },
        });
        cleared += 1;
      } else {
        unchanged += 1;
      }
      continue;
    }

    // Tier 2: unmapped, active — try email match.
    if (!u.active) continue;
    const candidate = byEmail.get(u.email.toLowerCase().trim());
    if (candidate && candidate.status === "Active") {
      await prisma.user.update({
        where: { id: u.id },
        data: { employmentHeroEmployeeId: candidate.id },
      });
      newlyMapped += 1;
    } else {
      unmatched.push({ userId: u.id, email: u.email });
    }
  }

  const summary = {
    totalEhEmployees: employees.length,
    activeEhEmployees: employees.filter((e) => e.status === "Active").length,
    unchanged,
    newlyMapped,
    cleared,
    unmatchedCount: unmatched.length,
    // Don't dump 50+ emails into the response payload, just the first 10
    // as a quick admin signal. Full list is in the structured log.
    unmatchedSample: unmatched.slice(0, 10),
    durationMs: Date.now() - startMs,
  };

  logger.info("EH Payroll employee sync complete", summary);
  if (unmatched.length > 0) {
    logger.warn("EH Payroll unmatched users", {
      count: unmatched.length,
      emails: unmatched.map((u) => u.email),
    });
  }

  await guard.complete(summary);
  return NextResponse.json(summary);
});
