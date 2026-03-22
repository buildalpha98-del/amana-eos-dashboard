import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { holidayQuestProgrammeEmail } from "@/lib/email-templates";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const bodySchema = z.object({
  serviceId: z.string().min(1, "serviceId is required"),
  from: z.string().min(1, "from date is required"),
  to: z.string().min(1, "to date is required"),
});

/**
 * POST /api/communication/holiday-quest/promo — Generate promotional content
 *
 * Body: { serviceId, from, to }
 * Returns email HTML + social post captions for the holiday period.
 */
export const POST = withApiAuth(async (req, session) => {
  const raw = await req.json();
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { serviceId, from, to } = parsed.data;

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, name: true },
  });
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const days = await prisma.holidayQuestDay.findMany({
    where: {
      serviceId,
      date: { gte: new Date(from), lte: new Date(to) },
    },
    orderBy: { date: "asc" },
  });

  if (days.length === 0) {
    return NextResponse.json(
      { error: "No Holiday Quest days found for this period" },
      { status: 404 },
    );
  }

  // Format period label
  const startDate = new Date(from).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
  const endDate = new Date(to).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const periodLabel = `${startDate} — ${endDate}`;

  // Generate email
  const email = holidayQuestProgrammeEmail(
    service.name,
    periodLabel,
    days.map((d) => ({
      date: d.date.toISOString(),
      theme: d.theme,
      morningActivity: d.morningActivity,
      afternoonActivity: d.afternoonActivity,
      isExcursion: d.isExcursion,
      excursionVenue: d.excursionVenue || undefined,
    })),
  );

  // Generate social post captions
  const socialPosts = days.map((d) => {
    const dateStr = d.date.toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

    const excursionNote = d.isExcursion && d.excursionVenue
      ? `\nWe're heading to ${d.excursionVenue}! `
      : "";

    const caption = [
      `${d.theme} at ${service.name}!`,
      `Join us on ${dateStr} for an amazing day of Holiday Quest fun.`,
      excursionNote,
      `AM: ${d.morningActivity}`,
      `PM: ${d.afternoonActivity}`,
      "",
      `$100/day (CCS may apply)`,
      "Book now — places are limited!",
      "",
      "#HolidayQuest #AmanaOSHC #VacationCare #SchoolHolidays #OSHC",
    ]
      .join("\n")
      .trim();

    return { date: d.date.toISOString(), caption };
  });

  return NextResponse.json({ email, socialPosts });
}, { roles: ["owner", "head_office", "admin"] });
