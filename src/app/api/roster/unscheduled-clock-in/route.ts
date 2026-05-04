/**
 * POST /api/roster/unscheduled-clock-in
 *
 * Walk-in fallback: staff turns up but has no scheduled shift in the
 * ±2h window. Creates a fresh `RosterShift` row with
 * `status = "unscheduled"`, `actualStart = now()`, sessionType
 * inferred from the time-of-day (BSC/VC/ASC). Admin reconciles
 * later from the per-service grid.
 *
 * Body (optional): `{ serviceId? }` — required when the staff is
 * cross-attached to multiple services. For the typical single-
 * service case, falls back to `session.user.serviceId`.
 *
 * 2026-05-04: timeclock v1, sub-PR 2. Mirrors the children
 * walk-in flow shipped in PR #40 (same mental model: "this person
 * is here even though they weren't booked — record now, reconcile
 * later").
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { z } from "zod";
import { inferSessionType } from "@/lib/timeclock-pick";

const bodySchema = z
  .object({
    serviceId: z.string().min(1).optional(),
  })
  .partial();

export const POST = withApiAuth(async (req, session) => {
  const raw = await parseJsonBody(req).catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }

  // Use the body's serviceId if supplied, else fall back to the
  // session's. This anticipates multi-service-attachment without
  // shipping it; for now both paths just produce session.user.serviceId
  // unless the caller explicitly overrides.
  const callerServiceId =
    (session.user as { serviceId?: string | null }).serviceId ?? null;
  const serviceId = parsed.data.serviceId ?? callerServiceId;
  if (!serviceId) {
    throw ApiError.badRequest(
      "Cannot create an unscheduled clock-in: you have no service assigned.",
    );
  }

  const now = new Date();
  const sessionType = inferSessionType(now);

  // Floor the start to the nearest 15-min mark for grid-display
  // purposes, but the actual clock-in time is `now` precisely.
  const flooredStart = new Date(now);
  const minutes = flooredStart.getMinutes();
  flooredStart.setMinutes(minutes - (minutes % 15), 0, 0);
  const hh = String(flooredStart.getHours()).padStart(2, "0");
  const mm = String(flooredStart.getMinutes()).padStart(2, "0");
  const shiftStart = `${hh}:${mm}`;
  // shiftEnd is unknown until clock-out; default to start so the
  // unique constraint (serviceId, date, staffName, shiftStart) doesn't
  // need a sentinel. Admin reconciles when the actual times are in.
  const shiftEnd = shiftStart;

  // Date column is a DATE (no time component) — strip the time.
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const created = await prisma.rosterShift.create({
    data: {
      serviceId,
      userId: session.user.id,
      staffName: session.user.name ?? "Unscheduled walk-in",
      date: today,
      sessionType,
      shiftStart,
      shiftEnd,
      status: "unscheduled",
      createdById: session.user.id,
      actualStart: now,
    },
  });

  return NextResponse.json({ shift: created }, { status: 201 });
});
