import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const entrySchema = z.object({
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

const bulkSchema = z.object({
  entries: z.array(entrySchema).min(1).max(200),
});

const entryIncludes = {
  service: { select: { id: true, name: true, code: true } },
  assignee: { select: { id: true, name: true, avatar: true } },
  campaign: { select: { id: true, name: true } },
} as const;

// POST /api/marketing/term-calendar/bulk — bulk create entries
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = bulkSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  // Create all entries in a transaction
  const created = await prisma.$transaction(
    parsed.data.entries.map((entry) =>
      prisma.termCalendarEntry.create({
        data: {
          year: entry.year,
          term: entry.term,
          week: entry.week,
          channel: entry.channel,
          serviceId: entry.serviceId || null,
          title: entry.title,
          description: entry.description || null,
          status: entry.status,
          assigneeId: entry.assigneeId || null,
          campaignId: entry.campaignId || null,
        },
        include: entryIncludes,
      }),
    ),
  );

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "TermCalendarEntry",
      entityId: created[0].id,
      details: {
        bulk: true,
        count: created.length,
        term: `T${parsed.data.entries[0].term}`,
        year: parsed.data.entries[0].year,
      },
    },
  });

  return NextResponse.json(
    { created: created.length, entries: created },
    { status: 201 },
  );
}
