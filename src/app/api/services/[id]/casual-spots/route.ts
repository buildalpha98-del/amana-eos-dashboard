/**
 * The casual spot grid: for each day and room, how many seats there are,
 * who's in them, and how many are left.
 *
 * GET   ?from=&to= → a row per day per bookable room.
 * POST  → set capacity (and open/closed) across a date range. This is
 *         OWNA's "Add Casual Spots", without generating a row per seat:
 *         a day needs a COUNT and a switch, and which seats are taken
 *         comes from the bookings that already exist, so the two can
 *         never disagree.
 * DELETE ?date=&sessionType= → drop the override, returning the day to
 *         the room's standing configuration.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import {
  bookableSessionKeys,
  roomLabel,
  type SessionKey,
  type SessionTimes,
} from "@/lib/service-settings";
import type { SessionType } from "@prisma/client";
import { requireRoomId } from "@/lib/room-resolver";

const SESSION_TYPES = [
  "bsc",
  "asc",
  "vc",
  "extra1",
  "extra2",
  "extra3",
  "extra4",
] as const;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const toYmd = (d: Date) => d.toISOString().slice(0, 10);
/** A term at a time. Beyond that the grid is unreadable anyway. */
const MAX_RANGE_DAYS = 90;

const writeSchema = z.object({
  from: z.string().regex(YMD),
  to: z.string().regex(YMD),
  sessionType: z.enum(SESSION_TYPES),
  spots: z.number().int().min(0).max(500).optional(),
  closed: z.boolean().optional(),
  note: z.string().trim().max(200).optional(),
  /** Weekdays to write, 0=Sun. Omitted means every day in the range. */
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
});

function eachDay(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += 86400_000) {
    out.push(new Date(t));
  }
  return out;
}

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  assertServiceAccess(session as never, id);

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  if (!fromParam || !toParam || !YMD.test(fromParam) || !YMD.test(toParam)) {
    throw ApiError.badRequest("from and to are required (YYYY-MM-DD)");
  }
  const from = dateOnly(fromParam);
  const to = dateOnly(toParam);
  if (to < from) throw ApiError.badRequest("`to` is before `from`");
  const days = eachDay(from, to);
  if (days.length > MAX_RANGE_DAYS) {
    throw ApiError.badRequest(`Ask for ${MAX_RANGE_DAYS} days at most`);
  }

  const service = await prisma.service.findUnique({
    where: { id },
    select: { sessionTimes: true, casualBookingSettings: true },
  });
  if (!service) throw ApiError.notFound("Service not found");

  const sessionTimes = (service.sessionTimes ?? null) as SessionTimes | null;
  const rooms = bookableSessionKeys(sessionTimes);
  const settings = (service.casualBookingSettings ?? {}) as Record<
    string,
    { enabled?: boolean; spots?: number; days?: string[] } | undefined
  >;

  const [configs, bookings, blockOuts] = await Promise.all([
    prisma.casualDayConfig.findMany({
      where: { serviceId: id, date: { gte: from, lte: to } },
    }),
    prisma.booking.findMany({
      where: {
        serviceId: id,
        type: "casual",
        status: { in: ["confirmed", "requested"] },
        date: { gte: from, lte: to },
      },
      select: {
        id: true,
        date: true,
        sessionType: true,
        status: true,
        child: { select: { id: true, firstName: true, surname: true } },
      },
    }),
    prisma.serviceBlockOutDate.findMany({
      where: { serviceId: id, date: { gte: from, lte: to } },
      select: { date: true, sessionType: true, reason: true },
    }),
  ]);

  const cfgKey = (d: Date, s: string) => `${toYmd(d)}::${s}`;
  const cfgBy = new Map(configs.map((c) => [cfgKey(c.date, c.sessionType), c]));
  const bookedBy = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const k = cfgKey(b.date, b.sessionType as string);
    if (!bookedBy.has(k)) bookedBy.set(k, []);
    bookedBy.get(k)!.push(b);
  }
  const blockedBy = new Map(
    blockOuts.map((b) => [
      cfgKey(b.date, (b.sessionType as string) ?? "*"),
      b.reason,
    ]),
  );

  const DAY_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  const rows = days.flatMap((date) =>
    rooms.map((key: SessionKey) => {
      const k = cfgKey(date, key);
      const cfg = cfgBy.get(k);
      const s = settings[key];
      const booked = bookedBy.get(k) ?? [];
      // A whole-centre closure blocks every room that day.
      const blockedReason =
        blockedBy.get(cfgKey(date, key)) ?? blockedBy.get(cfgKey(date, "*"));
      // Does the room even run this weekday?
      const runsToday = (s?.days ?? []).includes(DAY_KEY[date.getUTCDay()]);
      const spots = cfg?.spots ?? s?.spots ?? 0;

      return {
        date: toYmd(date),
        sessionType: key,
        roomName: roomLabel(sessionTimes, key),
        enabled: s?.enabled === true,
        runsToday,
        spots,
        // Never negative: an overbooked day (staff placed children past
        // the cap) should read 0 left, not "-2 available".
        vacant: Math.max(0, spots - booked.length),
        booked: booked.map((b) => ({
          bookingId: b.id,
          status: b.status,
          childId: b.child?.id ?? null,
          childName: b.child
            ? `${b.child.firstName} ${b.child.surname}`.trim()
            : "Child",
        })),
        closed: cfg?.closed ?? false,
        hasOverride: Boolean(cfg),
        note: cfg?.note ?? null,
        blockedReason: blockedReason ?? null,
      };
    }),
  );

  return NextResponse.json({ from: fromParam, to: toParam, rows });
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const parsed = writeSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const d = parsed.data;
    if (d.spots === undefined && d.closed === undefined) {
      throw ApiError.badRequest("Set a number of spots, or open/close the day");
    }

    const from = dateOnly(d.from);
    const to = dateOnly(d.to);
    if (to < from) throw ApiError.badRequest("`to` is before `from`");
    const all = eachDay(from, to);
    if (all.length > MAX_RANGE_DAYS) {
      throw ApiError.badRequest(`Set ${MAX_RANGE_DAYS} days at most`);
    }

    // Weekend days are excluded unless explicitly asked for, matching
    // the way a coordinator thinks about a term.
    const days = d.weekdays
      ? all.filter((x) => d.weekdays!.includes(x.getUTCDay()))
      : all;

    // Stage 1 dual key, resolved once — every day in the range shares
    // one (service, slot) pair.
    const roomId = await requireRoomId(id, d.sessionType);

    // Upsert rather than createMany: setting a range twice should end at
    // the second value, not fail or duplicate.
    for (const date of days) {
      await prisma.casualDayConfig.upsert({
        where: {
          serviceId_date_sessionType: {
            serviceId: id,
            date,
            sessionType: d.sessionType as SessionType,
          },
        },
        create: {
          serviceId: id,
          date,
          roomId,
          sessionType: d.sessionType as SessionType,
          spots: d.spots ?? null,
          closed: d.closed ?? false,
          note: d.note || null,
          createdById: session!.user.id,
        },
        update: {
          ...(d.spots !== undefined ? { spots: d.spots } : {}),
          ...(d.closed !== undefined ? { closed: d.closed } : {}),
          ...(d.note !== undefined ? { note: d.note || null } : {}),
        },
      });
    }

    return NextResponse.json({ updated: days.length }, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);

export const DELETE = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    const sessionType = url.searchParams.get("sessionType");
    if (!date || !YMD.test(date) || !sessionType) {
      throw ApiError.badRequest("date and sessionType are required");
    }

    // Deleting the override returns the day to the room's standing
    // configuration — it doesn't touch a single booking.
    await prisma.casualDayConfig.deleteMany({
      where: {
        serviceId: id,
        date: dateOnly(date),
        sessionType: sessionType as SessionType,
      },
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
