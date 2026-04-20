import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const patchSchema = z.object({
  theme: z.string().optional(),
  morningActivity: z.string().optional(),
  afternoonActivity: z.string().optional(),
  isExcursion: z.boolean().optional(),
  excursionVenue: z.string().optional(),
  excursionCost: z.number().optional(),
  materialsNeeded: z.string().optional(),
  dietaryNotes: z.string().optional(),
  maxCapacity: z.number().optional(),
  currentBookings: z.number().optional(),
  status: z.string().optional(),
});
/**
 * GET /api/holiday-quest/[id] — single day detail
 */
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const day = await prisma.holidayQuestDay.findUnique({
    where: { id },
    include: { service: { select: { id: true, name: true, code: true } } },
  });

  if (!day) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(day);
});

/**
 * PATCH /api/holiday-quest/[id] — update a day
 */
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) data[key] = value;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const existing = await prisma.holidayQuestDay.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.holidayQuestDay.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}, { roles: ["owner", "head_office", "admin"] });

/**
 * DELETE /api/holiday-quest/[id] — delete a day
 */
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const existing = await prisma.holidayQuestDay.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.holidayQuestDay.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}, { roles: ["owner", "head_office", "admin"] });
