/**
 * POST /api/kiosk/clock
 *
 * Kiosk-side clock-in/out. Auth: bearer token in `Authorization`
 * header (matching a non-revoked `Kiosk` row) PLUS the staff
 * member's 4-digit PIN. Two layers — a stolen tablet alone can't
 * impersonate staff because the PIN's missing.
 *
 * Body: `{ userId, pin, action: "in" | "out" }`.
 *
 * Rate-limited per (userId × kioskId) at 5 attempts / minute on
 * failed PIN, to defeat the 4-digit brute-force window. We DO NOT
 * leak whether a userId exists vs whether the PIN is wrong — both
 * fail with the same 401 message.
 *
 * Once authenticated, the same `pickEligibleShift` logic that
 * powers the self-service `/auto` route runs here too. Unscheduled
 * walk-ins from the kiosk surface are out of scope for v1 — the
 * kiosk requires a scheduled shift; an admin handles walk-ins.
 *
 * 2026-05-04: timeclock v1, sub-PR 3.
 */

import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { authenticateKiosk } from "@/lib/kiosk-auth";
import { pickEligibleShift } from "@/lib/timeclock-pick";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { z } from "zod";

const bodySchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/),
  action: z.enum(["in", "out"]),
});

export async function POST(req: Request) {
  // ── 1. Authenticate the kiosk itself ─────────────────────
  const kiosk = await authenticateKiosk(req);
  if (!kiosk) {
    return NextResponse.json(
      { error: "Kiosk not authorised. Re-pair this device with a fresh token." },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await parseJsonBody(req as never);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { userId, pin, action } = parsed.data;

  // ── 2. Rate-limit failed PIN attempts ────────────────────
  // Key on (kiosk × user) so one user's brute-force on one kiosk
  // doesn't lock them out everywhere.
  const rlKey = `kiosk-pin:${kiosk.id}:${userId}`;
  const rl = await checkRateLimit(rlKey, 5, 60_000);
  if (rl.limited) {
    return NextResponse.json(
      {
        error:
          "Too many incorrect PIN attempts. Wait a minute and try again, or ask an admin to reset.",
      },
      { status: 429 },
    );
  }

  // ── 3. Look up the user + verify PIN + service membership ─
  // Same 401 message for "user doesn't exist" and "wrong PIN" so
  // an attacker with the kiosk token can't enumerate userIds.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      active: true,
      serviceId: true,
      kioskPinHash: true,
    },
  });
  const fail = NextResponse.json(
    { error: "Could not authorise. Check the staff member and PIN." },
    { status: 401 },
  );
  if (!user || !user.active) return fail;
  if (!user.kioskPinHash) return fail;
  if (user.serviceId !== kiosk.serviceId) return fail;
  const pinOk = await compare(pin, user.kioskPinHash);
  if (!pinOk) return fail;

  // ── 4. Pick the eligible shift via the shared helper ─────
  const now = new Date();
  const earliest = new Date(now);
  earliest.setDate(earliest.getDate() - 1);
  earliest.setHours(0, 0, 0, 0);
  const latest = new Date(now);
  latest.setDate(latest.getDate() + 2);
  latest.setHours(0, 0, 0, 0);

  const candidates = await prisma.rosterShift.findMany({
    where: { userId, date: { gte: earliest, lt: latest } },
    select: {
      id: true,
      date: true,
      shiftStart: true,
      shiftEnd: true,
      actualStart: true,
      actualEnd: true,
    },
  });

  const result = pickEligibleShift(candidates, now, action);

  if (result.kind === "ambiguous") {
    return NextResponse.json({ ambiguous: true, candidates: result.candidates });
  }
  if (result.kind === "none") {
    const message =
      action === "in"
        ? "No scheduled shift to clock in to right now. Ask an admin if you've been added to today's roster."
        : "No active clocked-in shift to close.";
    return NextResponse.json({ error: message }, { status: 404 });
  }

  // ── 5. Update the matched shift ─────────────────────────
  const updated = await prisma.rosterShift.update({
    where: { id: result.shift.id },
    data:
      action === "in"
        ? { actualStart: result.shift.actualStart ?? now }
        : { actualEnd: result.shift.actualEnd ?? now },
  });

  logger.info("Kiosk clock action", {
    kioskId: kiosk.id,
    serviceId: kiosk.serviceId,
    userId,
    userName: user.name,
    shiftId: updated.id,
    action,
  });

  return NextResponse.json({
    shift: updated,
    user: { id: user.id, name: user.name },
  });
}
