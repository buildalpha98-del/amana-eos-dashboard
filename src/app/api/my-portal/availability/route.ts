/**
 * GET /api/my-portal/availability — fetch own recurring weekly availability
 * PUT /api/my-portal/availability — full-replace own 7-day availability set
 *
 * Staff-portal-v2 Task 10.2. Self-scoped: any signed-in user manages their
 * OWN availability only (same pattern as quiet-hours — admins see it via
 * the roster overlay, they don't set it for someone else).
 *
 * Weekdays use the JS Date#getDay convention (0=Sunday … 6=Saturday). The
 * PUT is a full replace of all 7 entries inside a transaction so the set
 * can never end up partially written. Advisory only — the roster grid
 * shows an "Unavailable" hint; nothing blocks rostering.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

// HH:MM, 24h, leading-zero — matches what an <input type="time"> emits.
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const entrySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    available: z.boolean(),
    // Empty string from a cleared input collapses to null.
    startTime: z
      .string()
      .regex(TIME_REGEX, "Use HH:MM (e.g. 09:00)")
      .nullish()
      .or(z.literal("").transform(() => null)),
    endTime: z
      .string()
      .regex(TIME_REGEX, "Use HH:MM (e.g. 15:00)")
      .nullish()
      .or(z.literal("").transform(() => null)),
    note: z
      .string()
      .max(500)
      .nullish()
      .or(z.literal("").transform(() => null)),
  })
  .superRefine((entry, ctx) => {
    // Times only make sense on an available day.
    if (!entry.available && (entry.startTime || entry.endTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Times can only be set on days marked available",
      });
    }
    // HH:MM zero-padded strings compare correctly lexicographically.
    if (entry.startTime && entry.endTime && entry.endTime <= entry.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endTime must be after startTime",
      });
    }
  });

const putSchema = z
  .object({
    availability: z.array(entrySchema).length(7),
  })
  .superRefine((body, ctx) => {
    const weekdays = new Set(body.availability.map((e) => e.weekday));
    if (weekdays.size !== body.availability.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each weekday (0-6) must appear exactly once",
      });
    }
  });

const ROW_SELECT = {
  weekday: true,
  available: true,
  startTime: true,
  endTime: true,
  note: true,
} as const;

export const GET = withApiAuth(async (_req, session) => {
  const rows = await prisma.staffAvailability.findMany({
    where: { userId: session!.user.id },
    select: ROW_SELECT,
    orderBy: { weekday: "asc" },
  });
  return NextResponse.json({ availability: rows });
});

export const PUT = withApiAuth(async (req, session) => {
  const raw = await parseJsonBody(req);
  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten());
  }
  const userId = session!.user.id;

  // Full replace inside a transaction — the set is all-or-nothing.
  const rows = await prisma.$transaction(async (tx) => {
    await tx.staffAvailability.deleteMany({ where: { userId } });
    await tx.staffAvailability.createMany({
      data: parsed.data.availability.map((e) => ({
        userId,
        weekday: e.weekday,
        available: e.available,
        startTime: e.available ? (e.startTime ?? null) : null,
        endTime: e.available ? (e.endTime ?? null) : null,
        note: e.note ?? null,
      })),
    });
    return tx.staffAvailability.findMany({
      where: { userId },
      select: ROW_SELECT,
      orderBy: { weekday: "asc" },
    });
  });

  return NextResponse.json({ availability: rows });
});
