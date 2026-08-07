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
import type { SessionType } from "@prisma/client";

const SESSION_TYPES = [
  "bsc",
  "asc",
  "vc",
  "extra1",
  "extra2",
  "extra3",
  "extra4",
] as const;

const createSchema = z.object({
  /** YYYY-MM-DD, or a range — a closure is often a week of them. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Omit for a whole-centre closure. */
  sessionType: z.enum(SESSION_TYPES).optional(),
  reason: z.string().trim().max(200).optional(),
});

const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
/** A closure longer than a term is a mistake, not a closure. */
const MAX_RANGE_DAYS = 90;

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  assertServiceAccess(session as never, id);

  const includePast = new URL(req.url).searchParams.get("includePast") === "1";
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const rows = await prisma.serviceBlockOutDate.findMany({
    where: { serviceId: id, ...(includePast ? {} : { date: { gte: today } }) },
    orderBy: { date: "asc" },
    take: 200,
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({
    blockOutDates: rows.map((r) => ({
      id: r.id,
      date: r.date,
      sessionType: r.sessionType,
      // Null session = the whole centre, and the UI should say so
      // rather than leaving a blank where a room name goes.
      programmeName: r.sessionType ? programmeName(r.sessionType) : null,
      reason: r.reason,
      createdBy: r.createdBy?.name ?? null,
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

    const start = dateOnly(d.date);
    const end = d.endDate ? dateOnly(d.endDate) : start;
    if (end < start) {
      throw ApiError.badRequest("The last day can't be before the first");
    }
    const days = Math.round((end.getTime() - start.getTime()) / 86400_000) + 1;
    if (days > MAX_RANGE_DAYS) {
      throw ApiError.badRequest(
        `That's ${days} days. Block out a term at most — anything longer is a closure, not a block-out.`,
      );
    }

    const dates: Date[] = [];
    for (let i = 0; i < days; i++) {
      dates.push(new Date(start.getTime() + i * 86400_000));
    }

    // skipDuplicates so re-submitting a range that overlaps an existing
    // one tops it up rather than failing the whole request.
    await prisma.serviceBlockOutDate.createMany({
      data: dates.map((date) => ({
        serviceId: id,
        date,
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
