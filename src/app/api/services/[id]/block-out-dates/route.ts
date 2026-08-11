/**
 * Dates a room — or the whole centre — isn't running.
 *
 * Without this, a coordinator closing for a pupil-free day has two bad
 * options: switch casual bookings off entirely, which closes every other
 * day too, or let families book a day nobody will be there and sort it
 * out by phone afterwards.
 *
 * Deliberately no past dates in the default list: a block-out is a thing
 * you set up ahead of time, and a register full of last year's closures
 * buries the one you're looking for.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import { programmeName } from "@/lib/programme-names";
import { dateOnly, expandBlockOutDates } from "@/lib/block-out-dates";
import type { SessionType } from "@prisma/client";
import { resolveRoomId } from "@/lib/room-resolver";

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

const createSchema = z
  .object({
    /** YYYY-MM-DD, or a range — a closure is often a week of them. */
    date: z.string().regex(YMD).optional(),
    endDate: z.string().regex(YMD).optional(),
    /**
     * Discrete dates instead of a range — the every-Wednesday-this-term
     * shape, which a range can't express without blocking the days in
     * between.
     */
    dates: z.array(z.string().regex(YMD)).max(90).optional(),
    /**
     * Skip Saturdays and Sundays when expanding a RANGE. Defaults true,
     * matching what a term-holiday closure means: a centre that doesn't
     * open at the weekend gains nothing from rows saying it's shut.
     * Never applied to explicitly-listed `dates` — naming a Saturday is
     * unambiguous, and silently dropping it would be wrong.
     */
    excludeWeekends: z.boolean().optional(),
    /** Omit for a whole-centre closure. */
    sessionType: z.enum(SESSION_TYPES).optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.date || (v.dates && v.dates.length > 0), {
    message: "Give a date, a range, or a list of dates",
  });



export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  assertServiceAccess(session as never, id);

  const params = new URL(req.url).searchParams;
  const includePast = params.get("includePast") === "1";
  const from = params.get("from");
  const to = params.get("to");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  /**
   * Report mode: an explicit window, past dates included.
   *
   * The default list is deliberately forward-looking — a block-out is a
   * thing you set up ahead of time, and a register full of last year's
   * closures buries the one you're looking for. But "what did we close
   * last term" is a real question, and it needs the past.
   */
  const reporting = Boolean(from && to && YMD.test(from) && YMD.test(to));
  const dateFilter = reporting
    ? { date: { gte: dateOnly(from!), lte: dateOnly(to!) } }
    : includePast
      ? {}
      : { date: { gte: today } };

  const rows = await prisma.serviceBlockOutDate.findMany({
    where: { serviceId: id, ...dateFilter },
    orderBy: { date: "asc" },
    take: reporting ? 1000 : 200,
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({
    blockOutDates: rows.map((r) => ({
      id: r.id,
      date: r.date,
      sessionType: r.sessionType,
      // Stage 2: callers filter by room. Null still means the whole
      // centre — a closure with no room shuts every room.
      roomId: r.roomId,
      // Null session = the whole centre, and the UI should say so
      // rather than leaving a blank where a room name goes.
      programmeName: r.sessionType ? programmeName(r.sessionType) : null,
      reason: r.reason,
      createdBy: r.createdBy?.name ?? null,
      createdAt: r.createdAt,
    })),
  });
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const d = parsed.data;

    // Expansion lives in a pure helper so the edge cases — an
    // all-weekend range, a duplicated date, a range longer than a term —
    // are tested directly rather than through a mocked Prisma client.
    const expanded = expandBlockOutDates(d);
    if (!expanded.ok) throw ApiError.badRequest(expanded.error);
    const dates = expanded.dates;

    // Stage 1 dual key, resolved once for the whole range rather than
    // per date — every row here shares one (service, slot) pair.
    const roomId = await resolveRoomId(id, d.sessionType);

    // skipDuplicates so re-submitting a range that overlaps an existing
    // one tops it up rather than failing the whole request.
    await prisma.serviceBlockOutDate.createMany({
      data: dates.map((date) => ({
        serviceId: id,
        date,
        roomId,
        sessionType: (d.sessionType as SessionType) ?? null,
        reason: d.reason || null,
        createdById: session!.user.id,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ created: dates.length }, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);

export const DELETE = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const blockOutId = new URL(req.url).searchParams.get("blockOutId");
    if (!blockOutId) throw ApiError.badRequest("blockOutId is required");

    const existing = await prisma.serviceBlockOutDate.findUnique({
      where: { id: blockOutId },
      select: { serviceId: true },
    });
    if (!existing || existing.serviceId !== id) {
      throw ApiError.notFound("Block-out not found");
    }

    // Deleting is right here, unlike the compliance registers: a
    // block-out is a forward-looking setting, not a record of something
    // that happened. Removing one re-opens the day, which is the point.
    await prisma.serviceBlockOutDate.delete({ where: { id: blockOutId } });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
