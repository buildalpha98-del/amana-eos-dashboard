/**
 * GET   /api/my-portal/quiet-hours — fetch own quiet-hours preference
 * PATCH /api/my-portal/quiet-hours — update own quiet-hours preference
 *
 * Right to disconnect (Fair Work Act s333M, in force Aug 2024).
 * Staff set their own preference; admins see it read-only on the
 * staff profile. Documented preference is the audit trail if
 * after-hours contact becomes disputed.
 *
 * Auth: session-only (any signed-in user can set their OWN
 * preference). Admin doesn't get to set this for someone else.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

// HH:MM, 24h, leading-zero — matches what an <input type="time"> emits.
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const patchSchema = z.object({
  // Empty string from a cleared input collapses to null.
  quietHoursStart: z
    .string()
    .regex(TIME_REGEX, "Use HH:MM (e.g. 20:00)")
    .nullable()
    .or(z.literal("").transform(() => null)),
  quietHoursEnd: z
    .string()
    .regex(TIME_REGEX, "Use HH:MM (e.g. 07:00)")
    .nullable()
    .or(z.literal("").transform(() => null)),
  quietHoursNotes: z
    .string()
    .max(2_000)
    .nullable()
    .or(z.literal("").transform(() => null)),
});

export const GET = withApiAuth(async (_req, session) => {
  const me = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: {
      quietHoursStart: true,
      quietHoursEnd: true,
      quietHoursNotes: true,
    },
  });
  return NextResponse.json(me ?? {
    quietHoursStart: null,
    quietHoursEnd: null,
    quietHoursNotes: null,
  });
});

export const PATCH = withApiAuth(async (req, session) => {
  const raw = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  }

  // Either-both-or-neither for start/end — "20:00 to nothing" is
  // ambiguous (does it mean "from 20:00 onwards forever"? probably,
  // but better to require both).
  const bothNull =
    parsed.data.quietHoursStart === null && parsed.data.quietHoursEnd === null;
  const bothSet =
    parsed.data.quietHoursStart !== null && parsed.data.quietHoursEnd !== null;
  if (!bothNull && !bothSet) {
    throw ApiError.badRequest(
      "Set both quietHoursStart and quietHoursEnd, or clear both.",
    );
  }

  const updated = await prisma.user.update({
    where: { id: session!.user.id },
    data: {
      quietHoursStart: parsed.data.quietHoursStart,
      quietHoursEnd: parsed.data.quietHoursEnd,
      quietHoursNotes: parsed.data.quietHoursNotes,
    },
    select: {
      quietHoursStart: true,
      quietHoursEnd: true,
      quietHoursNotes: true,
    },
  });

  return NextResponse.json(updated);
});
