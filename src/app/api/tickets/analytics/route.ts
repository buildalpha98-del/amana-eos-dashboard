import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const rangeDays = parseInt(searchParams.get("days") || "30");
  const since = new Date();
  since.setDate(since.getDate() - rangeDays);

  const tickets = await prisma.supportTicket.findMany({
    where: { deleted: false, createdAt: { gte: since } },
    include: {
      assignedTo: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // --- avgFirstResponseHours ---
  const ticketsWithFirstResponse = tickets.filter((t) => t.firstResponseAt);
  const avgFirstResponseHours =
    ticketsWithFirstResponse.length > 0
      ? ticketsWithFirstResponse.reduce((sum, t) => {
          const diffMs =
            new Date(t.firstResponseAt!).getTime() -
            new Date(t.createdAt).getTime();
          return sum + diffMs / (1000 * 60 * 60);
        }, 0) / ticketsWithFirstResponse.length
      : null;

  // --- avgResolutionHours ---
  const ticketsWithResolution = tickets.filter((t) => t.resolvedAt);
  const avgResolutionHours =
    ticketsWithResolution.length > 0
      ? ticketsWithResolution.reduce((sum, t) => {
          const diffMs =
            new Date(t.resolvedAt!).getTime() -
            new Date(t.createdAt).getTime();
          return sum + diffMs / (1000 * 60 * 60);
        }, 0) / ticketsWithResolution.length
      : null;

  // --- volumeTrend (group by date YYYY-MM-DD) ---
  const volumeMap = new Map<string, number>();
  for (const t of tickets) {
    const dateKey = new Date(t.createdAt).toISOString().slice(0, 10);
    volumeMap.set(dateKey, (volumeMap.get(dateKey) || 0) + 1);
  }
  const volumeTrend = Array.from(volumeMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  // --- byPriority ---
  const byPriority: Record<string, number> = {};
  for (const t of tickets) {
    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
  }

  // --- byStatus ---
  const byStatus: Record<string, number> = {};
  for (const t of tickets) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  }

  // --- byCentre (group by service) ---
  const centreMap = new Map<
    string,
    { name: string; code: string; count: number }
  >();
  for (const t of tickets) {
    if (t.service) {
      const existing = centreMap.get(t.service.id);
      if (existing) {
        existing.count++;
      } else {
        centreMap.set(t.service.id, {
          name: t.service.name,
          code: t.service.code,
          count: 1,
        });
      }
    }
  }
  const byCentre = Array.from(centreMap.values()).sort(
    (a, b) => b.count - a.count
  );

  // --- agentWorkload (group by assignedTo) ---
  const agentMap = new Map<
    string,
    {
      id: string;
      name: string;
      ticketCount: number;
      totalResponseHours: number;
      responseCount: number;
    }
  >();
  for (const t of tickets) {
    if (t.assignedTo) {
      const existing = agentMap.get(t.assignedTo.id);
      const responseHours = t.firstResponseAt
        ? (new Date(t.firstResponseAt).getTime() -
            new Date(t.createdAt).getTime()) /
          (1000 * 60 * 60)
        : null;

      if (existing) {
        existing.ticketCount++;
        if (responseHours !== null) {
          existing.totalResponseHours += responseHours;
          existing.responseCount++;
        }
      } else {
        agentMap.set(t.assignedTo.id, {
          id: t.assignedTo.id,
          name: t.assignedTo.name,
          ticketCount: 1,
          totalResponseHours: responseHours ?? 0,
          responseCount: responseHours !== null ? 1 : 0,
        });
      }
    }
  }
  const agentWorkload = Array.from(agentMap.values())
    .map((a) => ({
      id: a.id,
      name: a.name,
      ticketCount: a.ticketCount,
      avgResponseHours:
        a.responseCount > 0
          ? Math.round((a.totalResponseHours / a.responseCount) * 10) / 10
          : null,
    }))
    .sort((a, b) => b.ticketCount - a.ticketCount);

  return NextResponse.json({
    totalTickets: tickets.length,
    avgFirstResponseHours:
      avgFirstResponseHours !== null
        ? Math.round(avgFirstResponseHours * 10) / 10
        : null,
    avgResolutionHours:
      avgResolutionHours !== null
        ? Math.round(avgResolutionHours * 10) / 10
        : null,
    volumeTrend,
    byPriority,
    byStatus,
    byCentre,
    agentWorkload,
  });
}
