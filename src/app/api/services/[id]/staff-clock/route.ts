/**
 * Attendances → Staff (2026-10-09, Daniel: "where's the staff sign in and
 * sign out?").
 *
 * GET  — today's rostered shifts at the centre with who's in, since when.
 * POST { userId, action, pin? } — clock someone in or out.
 *   - Your own shift: no PIN (you're signed in as you).
 *   - Someone else's (the centre login on the shared iPad / front desk):
 *     their 4-digit clock-in PIN, checked against THEIR hash — the screen
 *     is shared, the PIN is what proves who's clocking.
 * Same shift-picking and induction gate as the kiosk (src/lib/shift-clock).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import { checkRateLimit } from "@/lib/rate-limit";
import { clockShift } from "@/lib/shift-clock";
import { getLocalDateParts, serviceDateOnly } from "@/lib/timezone";

type Ctx = { params: Promise<{ id: string }> };
const hhmm = (d: Date) => {
  const { hour, minute } = getLocalDateParts(d);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as Ctx).params;
  assertServiceAccess(session, id);
  const shifts = await prisma.rosterShift.findMany({
    where: { serviceId: id, date: serviceDateOnly(), status: "published", userId: { not: null } },
    select: {
      id: true,
      userId: true,
      staffName: true,
      shiftStart: true,
      shiftEnd: true,
      sessionType: true,
      actualStart: true,
      actualEnd: true,
      user: { select: { name: true, avatar: true, kioskPinHash: true } },
    },
    orderBy: [{ shiftStart: "asc" }, { staffName: "asc" }],
  });
  return NextResponse.json({
    shifts: shifts.map((s) => ({
      id: s.id,
      userId: s.userId,
      name: s.user?.name ?? s.staffName,
      avatar: s.user?.avatar ?? null,
      hasPin: Boolean(s.user?.kioskPinHash),
      shiftStart: s.shiftStart,
      shiftEnd: s.shiftEnd,
      sessionType: s.sessionType,
      inAt: s.actualStart ? hhmm(s.actualStart) : null,
      outAt: s.actualEnd ? hhmm(s.actualEnd) : null,
    })),
  });
});

const schema = z.object({
  userId: z.string().min(1),
  action: z.enum(["in", "out"]),
  pin: z.string().regex(/^\d{4}$/).optional(),
  shiftId: z.string().optional(),
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as Ctx).params;
    assertServiceAccess(session, id);
    const parsed = schema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Invalid clock request");
    const { userId, action, pin, shiftId } = parsed.data;

    if (userId !== session.user.id) {
      if (!pin) throw ApiError.badRequest("Enter your 4-digit PIN.");
      const rl = await checkRateLimit(`centre-clock:${id}:${userId}`, 5, 60_000);
      if (rl.limited) throw new ApiError(429, "Too many wrong PINs. Wait a minute and try again.");
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          active: true,
          kioskPinHash: true,
          serviceId: true,
          serviceMemberships: { where: { serviceId: id, status: "active" }, select: { id: true } },
        },
      });
      const atCentre = target && (target.serviceId === id || target.serviceMemberships.length > 0);
      if (!target?.active || !atCentre || !target.kioskPinHash || !(await compare(pin, target.kioskPinHash))) {
        throw new ApiError(401, "That PIN didn't match. Try again.");
      }
    }

    const outcome = await clockShift(userId, action, new Date(), { shiftId });
    if (outcome.kind === "none") throw ApiError.notFound(outcome.message);
    if (outcome.kind === "ambiguous") {
      return NextResponse.json({ ambiguous: true, candidates: outcome.candidates }, { status: 409 });
    }
    return NextResponse.json({ ok: true, shift: outcome.shift });
  },
  { rateLimit: { max: 60, windowMs: 60_000 } },
);
