import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// ── Australian school terms (approximate) ────────────────────
function getCurrentTerm(
  date: Date = new Date(),
): { year: number; term: number } {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  // Term 1: late Jan – early Apr (months 0-2)
  // Term 2: late Apr – late Jun (months 3-5)
  // Term 3: mid Jul – mid Sep (months 6-8)
  // Term 4: early Oct – mid Dec (months 9-11)
  let term = 1;
  if (month >= 9) term = 4;
  else if (month >= 6) term = 3;
  else if (month >= 3) term = 2;
  return { year, term };
}

const createEntrySchema = z.object({
  year: z.number().int(),
  term: z.number().int().min(1).max(4),
  week: z.number().int().min(1).max(10),
  channel: z.enum([
    "social",
    "canva",
    "newsletter",
    "school_comms",
    "activation",
    "whatsapp",
    "compliance",
    "holiday_quest",
  ]),
  serviceId: z.string().optional(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z
    .enum(["planned", "in_progress", "completed", "skipped"])
    .default("planned"),
  assigneeId: z.string().optional(),
  campaignId: z.string().optional(),
});

const entryIncludes = {
  service: { select: { id: true, name: true, code: true } },
  assignee: { select: { id: true, name: true, avatar: true } },
  campaign: { select: { id: true, name: true } },
} as const;

// GET /api/marketing/term-calendar — fetch entries grouped by week
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const current = getCurrentTerm();
  const year = parseInt(searchParams.get("year") || String(current.year), 10);
  const term = parseInt(searchParams.get("term") || String(current.term), 10);
  const serviceId = searchParams.get("serviceId");
  const channel = searchParams.get("channel");

  const entries = await prisma.termCalendarEntry.findMany({
    where: {
      year,
      term,
      ...(serviceId ? { serviceId } : {}),
      ...(channel ? { channel } : {}),
    },
    include: entryIncludes,
    orderBy: [{ week: "asc" }, { channel: "asc" }, { createdAt: "asc" }],
  });

  // Group by week
  const weeks: Record<string, typeof entries> = {};
  for (let w = 1; w <= 10; w++) {
    weeks[String(w)] = [];
  }
  for (const entry of entries) {
    const key = String(entry.week);
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(entry);
  }

  // Summary
  const byStatus: Record<string, number> = {};
  const byChannel: Record<string, number> = {};
  for (const entry of entries) {
    byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
    byChannel[entry.channel] = (byChannel[entry.channel] || 0) + 1;
  }

  return NextResponse.json({
    year,
    term,
    weeks,
    summary: {
      totalEntries: entries.length,
      byStatus,
      byChannel,
    },
  });
}, { roles: ["owner", "head_office", "admin", "marketing"] });

// POST /api/marketing/term-calendar — create a single entry
export const POST = withApiAuth(async (req, session) => {
const body = await req.json();
  const parsed = createEntrySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const entry = await prisma.termCalendarEntry.create({
    data: {
      year: parsed.data.year,
      term: parsed.data.term,
      week: parsed.data.week,
      channel: parsed.data.channel,
      serviceId: parsed.data.serviceId || null,
      title: parsed.data.title,
      description: parsed.data.description || null,
      status: parsed.data.status,
      assigneeId: parsed.data.assigneeId || null,
      campaignId: parsed.data.campaignId || null,
    },
    include: entryIncludes,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "TermCalendarEntry",
      entityId: entry.id,
      details: {
        title: entry.title,
        term: `T${entry.term}W${entry.week}`,
        channel: entry.channel,
      },
    },
  });

  return NextResponse.json(entry, { status: 201 });
}, { roles: ["owner", "head_office", "admin", "marketing"] });
