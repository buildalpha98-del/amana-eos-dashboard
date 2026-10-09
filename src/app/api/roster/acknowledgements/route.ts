/**
 * GET  /api/roster/acknowledgements?serviceId=&from=&to= — who has and
 *      hasn't seen their shifts for that week (2026-10-09, OWNA parity).
 * POST /api/roster/acknowledgements { serviceId, from, to } — remind the
 *      ones who haven't.
 * The centre's Coordinator / centre login, or the office.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { notifyUsers } from "@/lib/notify-user";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const schema = z.object({ serviceId: z.string().min(1), from: z.string().regex(DAY), to: z.string().regex(DAY) });

function assertRunsRoster(session: { user: { role?: string | null; serviceId?: string | null } }, serviceId: string) {
  const role = session.user.role ?? "";
  if (isAdminRole(role)) return;
  if (role === "member" && session.user.serviceId === serviceId) return;
  throw ApiError.forbidden("Only this centre's Coordinator or the office can see this.");
}

async function weekStatus(serviceId: string, from: string, to: string) {
  const shifts = await prisma.rosterShift.findMany({
    where: {
      serviceId,
      status: "published",
      userId: { not: null },
      date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
    },
    select: { userId: true, staffName: true, acknowledgedAt: true },
  });
  const byUser = new Map<string, { userId: string; name: string; shifts: number; unseen: number }>();
  for (const s of shifts) {
    const row = byUser.get(s.userId!) ?? { userId: s.userId!, name: s.staffName, shifts: 0, unseen: 0 };
    row.shifts += 1;
    if (!s.acknowledgedAt) row.unseen += 1;
    byUser.set(s.userId!, row);
  }
  const people = [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { people, seen: people.filter((p) => p.unseen === 0).length, total: people.length };
}

export const GET = withApiAuth(async (req, session) => {
  const sp = new URL(req.url).searchParams;
  const parsed = schema.safeParse({ serviceId: sp.get("serviceId"), from: sp.get("from"), to: sp.get("to") });
  if (!parsed.success) throw ApiError.badRequest("serviceId, from and to are required");
  assertRunsRoster(session, parsed.data.serviceId);
  return NextResponse.json(await weekStatus(parsed.data.serviceId, parsed.data.from, parsed.data.to));
});

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = schema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("serviceId, from and to are required");
    assertRunsRoster(session, parsed.data.serviceId);
    const { people } = await weekStatus(parsed.data.serviceId, parsed.data.from, parsed.data.to);
    const ids = people.filter((p) => p.unseen > 0).map((p) => p.userId);
    const sent = await notifyUsers(prisma, ids, {
      type: "roster",
      title: "Please check your shifts",
      body: "Your roster has new or changed shifts. Open it and tap “I’ve seen my shifts”.",
      link: "/my-day",
    });
    return NextResponse.json({ reminded: sent });
  },
  { rateLimit: { max: 10, windowMs: 60_000 } },
);
