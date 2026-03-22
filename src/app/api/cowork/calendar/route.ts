import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "../../_lib/auth";
import { calendarEventsSchema } from "../../_lib/validation";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

// POST /api/cowork/calendar — Add calendar events (batch)
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = calendarEventsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { events } = parsed.data;

    const created = await prisma.$transaction(
      events.map((evt) =>
        prisma.calendarEvent.create({
          data: {
            title: evt.title,
            date: evt.date,
            endDate: evt.endDate ?? null,
            centreId: evt.centreId ?? null,
            type: evt.type,
            details: evt.details ?? null,
          },
        })
      )
    );

    return NextResponse.json({ events: created }, { status: 201 });
  } catch (err) {
    logger.error("Cowork Calendar POST", { err });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

// GET /api/cowork/calendar — Retrieve events
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const centreId = searchParams.get("centreId");
    const month = searchParams.get("month"); // e.g. "2026-03"
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let dateFrom: Date;
    let dateTo: Date;

    if (month) {
      // Parse "2026-03" → first and last day of month
      const [year, m] = month.split("-").map(Number);
      if (!year || !m || m < 1 || m > 12) {
        return NextResponse.json({ error: "Invalid month format (YYYY-MM)" }, { status: 400 });
      }
      dateFrom = new Date(Date.UTC(year, m - 1, 1));
      dateTo = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
    } else if (from && to) {
      dateFrom = new Date(from);
      dateTo = new Date(to);
      if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
        return NextResponse.json({ error: "Invalid from/to dates" }, { status: 400 });
      }
      dateTo.setUTCHours(23, 59, 59, 999);
    } else {
      // Default: current month
      const now = new Date();
      dateFrom = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      dateTo = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
    }

    const events = await prisma.calendarEvent.findMany({
      where: {
        date: { gte: dateFrom, lte: dateTo },
        // Match centreId or null (all-centre events)
        ...(centreId
          ? { OR: [{ centreId }, { centreId: null }] }
          : {}),
      },
      orderBy: { date: "asc" },
    });

    const res = NextResponse.json({ events });
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res;
  } catch (err) {
    logger.error("Cowork Calendar GET", { err });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
