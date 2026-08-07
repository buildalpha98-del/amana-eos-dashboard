import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = req.nextUrl;
  const days = parseInt(searchParams.get("days") ?? "30", 10);
  const since = new Date(Date.now() - days * 86400000);

  const [logs, totals, eventCounts, volumeRows] = await Promise.all([
    // Recent sends (last N days, most recent first)
    prisma.deliveryLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        channel: true,
        messageType: true,
        subject: true,
        status: true,
        recipientCount: true,
        serviceCode: true,
        entityType: true,
        createdAt: true,
      },
    }),
    // Aggregated stats
    prisma.deliveryLog.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since } },
      _count: true,
      _sum: { recipientCount: true },
    }),
    // Unique opens/clicks — the webhook dedupes on (messageId, type, email),
    // so these counts ARE unique-recipient counts, not raw event totals.
    prisma.emailEvent.groupBy({
      by: ["type"],
      where: { createdAt: { gte: since }, type: { in: ["opened", "clicked"] } },
      _count: true,
    }),
    // Full-window rows for the daily volume chart (recentSends above is
    // capped at 50, which silently truncated the chart on busy periods).
    prisma.deliveryLog.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
  ]);

  const stats = {
    totalSends: totals.reduce((sum, t) => sum + t._count, 0),
    totalRecipients: totals.reduce((sum, t) => sum + (t._sum.recipientCount ?? 0), 0),
    sent: totals.find((t) => t.status === "sent")?._count ?? 0,
    failed: totals.find((t) => t.status === "failed")?._count ?? 0,
    scheduled: totals.find((t) => t.status === "scheduled")?._count ?? 0,
    uniqueOpens: eventCounts.find((t) => t.type === "opened")?._count ?? 0,
    uniqueClicks: eventCounts.find((t) => t.type === "clicked")?._count ?? 0,
  };

  // Daily send volume for chart (full window, not just the 50-row slice)
  const dailyVolume: Record<string, number> = {};
  for (const row of volumeRows) {
    const day = row.createdAt.toISOString().split("T")[0];
    dailyVolume[day] = (dailyVolume[day] ?? 0) + 1;
  }

  return NextResponse.json({
    stats,
    recentSends: logs,
    dailyVolume: Object.entries(dailyVolume)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    period: `${days} days`,
  });
});
