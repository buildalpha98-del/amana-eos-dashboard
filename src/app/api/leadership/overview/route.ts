import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";

/**
 * GET /api/leadership/overview
 *
 * Org-wide KPI aggregator for the /leadership page.
 * Admin-tier only (owner / head_office / admin).
 *
 * Returns:
 *   - staffCount: active User count
 *   - serviceCount: active Service count
 *   - openIssueCount: Issue rows with status not in (solved, closed)
 *   - openTicketCount: SupportTicket rows with status not in (resolved, closed)
 *   - rocksRollup: current-quarter rock counts grouped by status (onTrack / offTrack / complete / dropped) + by service
 *   - sentimentTrend: last 8 weeks of avg WeeklyPulse.mood per weekOf
 */
export const GET = withApiAuth(async () => {
  const now = new Date();
  const quarter = `Q${Math.floor(now.getMonth() / 3) + 1}-${now.getFullYear()}`;

  const eightWeeksAgo = new Date(now);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

  const [
    staffCount,
    serviceCount,
    openIssueCount,
    openTicketCount,
    quarterRocks,
    recentPulses,
  ] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.service.count({ where: { status: "active" } }),
    prisma.issue.count({ where: { status: { notIn: ["solved", "closed"] } } }),
    prisma.supportTicket.count({
      where: { deleted: false, status: { notIn: ["resolved", "closed"] } },
    }),
    prisma.rock.findMany({
      where: { quarter, deleted: false },
      select: {
        id: true,
        status: true,
        serviceId: true,
        service: { select: { id: true, name: true } },
      },
    }),
    prisma.weeklyPulse.findMany({
      where: {
        submittedAt: { not: null },
        weekOf: { gte: eightWeeksAgo },
        mood: { not: null },
      },
      select: { weekOf: true, mood: true },
    }),
  ]);

  const rocksRollup = {
    quarter,
    total: quarterRocks.length,
    onTrack: quarterRocks.filter((r) => r.status === "on_track").length,
    offTrack: quarterRocks.filter((r) => r.status === "off_track").length,
    complete: quarterRocks.filter((r) => r.status === "complete").length,
    dropped: quarterRocks.filter((r) => r.status === "dropped").length,
    byService: Array.from(
      quarterRocks
        .filter((r) => r.service)
        .reduce((acc, r) => {
          const key = r.service!.id;
          const entry = acc.get(key) ?? {
            serviceId: key,
            serviceName: r.service!.name,
            total: 0,
            onTrack: 0,
          };
          entry.total += 1;
          if (r.status === "on_track") entry.onTrack += 1;
          acc.set(key, entry);
          return acc;
        }, new Map<string, { serviceId: string; serviceName: string; total: number; onTrack: number }>())
        .values()
    ).sort((a, b) => b.total - a.total),
  };

  const byWeek = new Map<string, { sum: number; count: number }>();
  for (const p of recentPulses) {
    const key = p.weekOf.toISOString();
    const entry = byWeek.get(key) ?? { sum: 0, count: 0 };
    entry.sum += p.mood!;
    entry.count += 1;
    byWeek.set(key, entry);
  }
  const sentimentTrend = Array.from(byWeek.entries())
    .map(([weekOf, { sum, count }]) => ({
      weekOf,
      avgMood: Math.round((sum / count) * 10) / 10,
      count,
    }))
    .sort((a, b) => a.weekOf.localeCompare(b.weekOf));

  return NextResponse.json({
    staffCount,
    serviceCount,
    openIssueCount,
    openTicketCount,
    rocksRollup,
    sentimentTrend,
  });
}, { roles: [...ADMIN_ROLES] });
