/**
 * Morning-briefing cron (2026-07-05).
 *
 * Runs daily before the workday (vercel.json → 20:00 UTC ≈ 06:00 AEST)
 * and, for every active leadership-tier user:
 *   1. collects live signals (overdue EOS items, expiring certs on
 *      rostered staff, missing clock-outs, stale enquiries, meetings)
 *   2. composes a short brief (AI prose, deterministic fallback)
 *   3. upserts today's DailyBriefing + drops a notification
 *
 * Also prepares the AI agenda draft for any L10 scheduled today that
 * doesn't have one yet (draft-first meetings).
 *
 * Idempotent: same-day re-runs no-op via acquireCronLock; the
 * (userId, date) unique constraint means a partial failure re-run only
 * fills the gaps. Per-user error isolation — one bad compose never
 * kills the batch.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import {
  BRIEFING_ROLES,
  collectBriefingSignals,
  composeBriefing,
  totalSignalCount,
} from "@/lib/morning-briefing";
import { prepareMeetingAgenda } from "@/lib/l10-prep";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";

export const maxDuration = 300;

export const GET = withApiHandler(
  async (req) => {
    const authCheck = verifyCronSecret(req);
    if (authCheck) return authCheck.error;

    const guard = await acquireCronLock("morning-briefing", "daily");
    if (!guard.acquired) {
      return NextResponse.json({ skipped: true, reason: guard.reason });
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    // ── 1. Prepare agendas for today's unprepared meetings first, so
    //       the briefs can say "the agenda draft is ready". ──────────
    const meetingsToday = await prisma.meeting.findMany({
      where: {
        status: "scheduled",
        // Json-null filter: AnyNull matches both SQL NULL and JSON null.
        aiAgendaDraft: { equals: Prisma.AnyNull },
        date: {
          gte: todayStart,
          lt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      select: { id: true },
    });
    let agendasPrepared = 0;
    for (const m of meetingsToday) {
      try {
        await prepareMeetingAgenda(m.id);
        agendasPrepared += 1;
      } catch (err) {
        logger.error("Morning briefing: L10 prep failed", {
          meetingId: m.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── 2. Compose per-user briefs. ─────────────────────────────────
    const users = await prisma.user.findMany({
      where: { active: true, role: { in: [...BRIEFING_ROLES] } },
      select: { id: true, name: true, role: true, serviceId: true },
    });

    let created = 0;
    let skippedExisting = 0;
    let quiet = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        const existing = await prisma.dailyBriefing.findUnique({
          where: { userId_date: { userId: user.id, date: todayStart } },
          select: { id: true },
        });
        if (existing) {
          skippedExisting += 1;
          continue;
        }

        const signals = await collectBriefingSignals(user, now);
        // Quiet mornings still get a row (the card shows "all clear")
        // but no notification — don't ping people about nothing.
        const { content, source } = await composeBriefing(
          user.name ?? "there",
          user.role,
          signals,
        );

        await prisma.dailyBriefing.create({
          data: {
            userId: user.id,
            date: todayStart,
            content,
            signals: signals as object,
            source,
          },
        });
        created += 1;

        if (totalSignalCount(signals) > 0) {
          await prisma.userNotification.create({
            data: {
              userId: user.id,
              type: NOTIFICATION_TYPES.MORNING_BRIEF_READY,
              title: "Your morning brief is ready",
              body: `${totalSignalCount(signals)} item(s) need attention today`,
              link: "/dashboard",
            },
          });
        } else {
          quiet += 1;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${user.id}: ${msg}`);
        logger.error("Morning briefing: user compose failed", {
          userId: user.id,
          error: msg,
        });
      }
    }

    await guard.complete({ created, skippedExisting, quiet, agendasPrepared });

    return NextResponse.json({
      created,
      skippedExisting,
      quiet,
      agendasPrepared,
      errors: errors.length,
    });
  },
  { timeoutMs: 290_000 },
);
