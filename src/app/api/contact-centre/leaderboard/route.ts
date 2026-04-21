import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";

/**
 * GET /api/contact-centre/leaderboard?days=30
 *
 * Per-coordinator metrics (default 30 days, clamped 1..365):
 *   - ticketsAssigned / ticketsResolved
 *   - avgFirstResponseMin: mean minutes createdAt → firstResponseAt
 *   - enquiriesTotal / enquiriesConverted (stage === "enrolled")
 *
 * Names ARE shown — coordinators voluntarily accept ownership. Contrasts
 * with Pulse (involuntary sentiment) where we keep anonymity.
 */
export const GET = withApiAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const daysRaw = Number.parseInt(searchParams.get("days") ?? "30", 10);
  const days = Math.max(1, Math.min(365, Number.isFinite(daysRaw) ? daysRaw : 30));

  const since = new Date();
  since.setDate(since.getDate() - days);

  const [users, tickets, enquiries] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: { in: ["coordinator", "admin", "owner", "head_office", "member"] } },
      select: { id: true, name: true, email: true, avatar: true, role: true },
    }),
    prisma.supportTicket.findMany({
      where: { deleted: false, createdAt: { gte: since }, assignedToId: { not: null } },
      select: {
        id: true,
        assignedToId: true,
        status: true,
        createdAt: true,
        firstResponseAt: true,
        resolvedAt: true,
      },
    }),
    prisma.parentEnquiry.findMany({
      where: { deleted: false, createdAt: { gte: since }, assigneeId: { not: null } },
      select: { id: true, assigneeId: true, stage: true },
    }),
  ]);

  const byUser = new Map<string, {
    userId: string;
    name: string;
    email: string;
    avatar: string | null;
    role: string;
    ticketsAssigned: number;
    ticketsResolved: number;
    firstResponseMinSum: number;
    firstResponseCount: number;
    avgFirstResponseMin: number | null;
    enquiriesTotal: number;
    enquiriesConverted: number;
  }>();

  function ensure(userId: string) {
    let row = byUser.get(userId);
    if (!row) {
      const u = users.find((x) => x.id === userId);
      row = {
        userId,
        name: u?.name ?? "Unknown",
        email: u?.email ?? "",
        avatar: u?.avatar ?? null,
        role: u?.role ?? "unknown",
        ticketsAssigned: 0,
        ticketsResolved: 0,
        firstResponseMinSum: 0,
        firstResponseCount: 0,
        avgFirstResponseMin: null,
        enquiriesTotal: 0,
        enquiriesConverted: 0,
      };
      byUser.set(userId, row);
    }
    return row;
  }

  for (const t of tickets) {
    if (!t.assignedToId) continue;
    const row = ensure(t.assignedToId);
    row.ticketsAssigned += 1;
    if (t.status === "resolved" || t.status === "closed") row.ticketsResolved += 1;
    if (t.firstResponseAt && t.createdAt) {
      row.firstResponseMinSum += (t.firstResponseAt.getTime() - t.createdAt.getTime()) / 60_000;
      row.firstResponseCount += 1;
    }
  }
  for (const e of enquiries) {
    if (!e.assigneeId) continue;
    const row = ensure(e.assigneeId);
    row.enquiriesTotal += 1;
    if (e.stage === "enrolled") row.enquiriesConverted += 1;
  }

  const rows = Array.from(byUser.values())
    .map((r) => ({
      ...r,
      avgFirstResponseMin:
        r.firstResponseCount > 0
          ? Math.round(r.firstResponseMinSum / r.firstResponseCount)
          : null,
    }))
    .map((r) => {
      const { firstResponseMinSum: _sum, firstResponseCount: _count, ...rest } = r;
      return rest;
    })
    .sort((a, b) => (b.ticketsResolved + b.enquiriesConverted) - (a.ticketsResolved + a.enquiriesConverted));

  return NextResponse.json({ days, since: since.toISOString(), rows });
}, { roles: [...ADMIN_ROLES] });
