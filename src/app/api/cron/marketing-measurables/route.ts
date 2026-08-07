import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { effectiveDueDate } from "@/lib/creative-request/constants";
import { evaluateOnTrack } from "@/lib/measurable-eval";

/**
 * GET /api/cron/marketing-measurables
 *
 * Weekly cron (Sunday 20:45 UTC — after auto-measurables at 20:30, before
 * Monday's scorecard-missing nag) — auto-populates marketing scorecard
 * measurables from marketing-hub data.
 *
 * Matches measurables by NARROW title substrings (case-insensitive) so
 * manual measurables aren't hijacked (auto-measurables already claims
 * occupancy/attendance/enrolled/attended). Substrings with no matching
 * measurable are skipped silently:
 * - "turnaround" + ("request" | "design") → avg business-day turnaround of
 *   requests delivered in the past 7 days
 * - "creative request" / "design request" → on-time % of requests delivered
 *   in the past 7 days (deliveredAt <= effective due date)
 *   Both request metrics are SKIPPED entirely when nothing was delivered
 *   that week — an empty week is neither 100% nor 0%.
 * - "email open"       → unique opens, last 7 days (distinct recipient emails)
 * - "qr scan"          → QR scans, last 7 days (scoped to measurable.serviceId when set)
 * - "marketing enquir" → parent enquiries, last 7 days (scoped to measurable.serviceId when set)
 *
 * Auth: Bearer CRON_SECRET
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const NOTES = "Auto-populated from marketing hub data";

type Metric = "ontime" | "turnaround" | "email_opens" | "qr_scans" | "enquiries";

/** Narrow title dispatch. Turnaround first — "Creative request turnaround"
 *  must hit the turnaround metric, not the on-time one. */
function matchMetric(title: string): Metric | null {
  const t = title.toLowerCase();
  if (t.includes("turnaround") && (t.includes("request") || t.includes("design"))) {
    return "turnaround";
  }
  if (t.includes("creative request") || t.includes("design request")) return "ontime";
  if (t.includes("email open")) return "email_opens";
  if (t.includes("qr scan")) return "qr_scans";
  if (t.includes("marketing enquir")) return "enquiries";
  return null;
}

/**
 * Approximate business-day span between two instants: fractional calendar
 * days minus whole weekend days in the range, minus requester-pause time
 * credited back at 24h/day. A pause spanning a weekend is slightly
 * double-credited — acceptable for a scorecard trend line; keep it simple.
 */
function businessDaySpan(start: Date, end: Date, pausedMs: number): number {
  let weekendDays = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (cursor < endDay) {
    const dow = cursor.getDay();
    if (dow === 0 || dow === 6) weekendDays++;
    cursor.setDate(cursor.getDate() + 1);
  }
  const calendarDays = (end.getTime() - start.getTime()) / DAY_MS;
  return Math.max(0, calendarDays - weekendDays - pausedMs / DAY_MS);
}

export const GET = withApiHandler(async (req) => {
  const authError = verifyCronSecret(req);
  if (authError) return authError.error;

  const guard = await acquireCronLock("marketing-measurables", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ skipped: true, reason: guard.reason });
  }

  try {
    const now = new Date();
    const since = new Date(now.getTime() - 7 * DAY_MS);

    // Calculate last week's Monday and this Monday
    const dayOfWeek = now.getDay();
    const thisMonday = new Date(now);
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    thisMonday.setDate(now.getDate() + mondayOffset);
    thisMonday.setHours(0, 0, 0, 0);

    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);

    const measurables = await prisma.measurable.findMany({
      where: {
        OR: [
          { title: { contains: "creative request", mode: "insensitive" } },
          { title: { contains: "design request", mode: "insensitive" } },
          { title: { contains: "turnaround", mode: "insensitive" } },
          { title: { contains: "email open", mode: "insensitive" } },
          { title: { contains: "qr scan", mode: "insensitive" } },
          { title: { contains: "marketing enquir", mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        title: true,
        serviceId: true,
        ownerId: true,
        goalValue: true,
        goalDirection: true,
      },
    });

    // The DB fetch is deliberately broader on "turnaround" (bare substring);
    // matchMetric applies the narrow AND so e.g. "Occupancy turnaround" is
    // dropped here rather than hijacked.
    const matched = measurables
      .map((m) => ({ measurable: m, metric: matchMetric(m.title) }))
      .filter((x): x is { measurable: (typeof measurables)[number]; metric: Metric } => x.metric !== null);

    // ── Shared inputs, fetched once and only when a measurable needs them ──
    let onTimePct: number | null = null;
    let avgTurnaround: number | null = null;
    if (matched.some((x) => x.metric === "ontime" || x.metric === "turnaround")) {
      const delivered = await prisma.creativeRequest.findMany({
        where: { deliveredAt: { gte: since, lte: now } },
        select: { createdAt: true, deliveredAt: true, dueDate: true, pausedMs: true },
      });
      // Zero delivered → both stay null → skipped (an empty week isn't a %).
      if (delivered.length > 0) {
        // pausedAt is always banked into pausedMs by delivery, so live pause = null.
        const onTime = delivered.filter(
          (r) => r.deliveredAt! <= effectiveDueDate(r.dueDate, r.pausedMs, null),
        ).length;
        onTimePct = Math.round((onTime / delivered.length) * 100);

        const totalDays = delivered.reduce(
          (sum, r) => sum + businessDaySpan(r.createdAt, r.deliveredAt!, r.pausedMs),
          0,
        );
        avgTurnaround = Math.round((totalDays / delivered.length) * 10) / 10;
      }
    }

    let uniqueOpens: number | null = null;
    if (matched.some((x) => x.metric === "email_opens")) {
      // Same unique-opens semantics as the attribution lib: group by
      // [type, email] and count distinct recipient emails in JS.
      const groups = await prisma.emailEvent.groupBy({
        by: ["type", "email"],
        where: { type: "opened", createdAt: { gte: since, lte: now } },
      });
      uniqueOpens = new Set(groups.map((g) => g.email)).size;
    }

    // ── Upsert one entry per matched measurable ────────────────────────────
    let populated = 0;
    for (const { measurable, metric } of matched) {
      let value: number | null = null;

      if (metric === "ontime") {
        value = onTimePct;
      } else if (metric === "turnaround") {
        value = avgTurnaround;
      } else if (metric === "email_opens") {
        value = uniqueOpens;
      } else if (metric === "qr_scans") {
        value = await prisma.qrScan.count({
          where: {
            scannedAt: { gte: since, lte: now },
            ...(measurable.serviceId ? { qrCode: { serviceId: measurable.serviceId } } : {}),
          },
        });
      } else if (metric === "enquiries") {
        value = await prisma.parentEnquiry.count({
          where: {
            deleted: false,
            createdAt: { gte: since, lte: now },
            ...(measurable.serviceId ? { serviceId: measurable.serviceId } : {}),
          },
        });
      }

      if (value === null) continue;

      const onTrack = evaluateOnTrack(value, measurable.goalValue, measurable.goalDirection);

      await prisma.measurableEntry.upsert({
        where: {
          measurableId_weekOf: {
            measurableId: measurable.id,
            weekOf: lastMonday,
          },
        },
        update: { value, onTrack, notes: NOTES },
        create: {
          measurableId: measurable.id,
          weekOf: lastMonday,
          value,
          onTrack,
          enteredById: measurable.ownerId,
          notes: NOTES,
        },
      });
      populated++;
    }

    await guard.complete({ measurablesFound: measurables.length, populated });
    return NextResponse.json({
      ok: true,
      measurablesFound: measurables.length,
      populated,
      weekOf: lastMonday.toISOString().split("T")[0],
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("marketing-measurables cron failed", { err });
    return NextResponse.json(
      { error: "marketing-measurables failed" },
      { status: 500 },
    );
  }
});
