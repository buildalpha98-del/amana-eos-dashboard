/**
 * PATCH /api/me/kiosk-pin
 *
 * Staff sets / changes their own 4-digit kiosk PIN. Hashed with
 * bcrypt before storing in `User.kioskPinHash`. Validated as
 * exactly four numeric digits — no alphabetic, no longer.
 *
 * Plain digit requirement is deliberate: the kiosk PIN pad has 0–9
 * keys only. A longer PIN would be more secure but creates friction
 * at the workstation; v1 favours speed-of-clock-in over PIN entropy.
 * The two layers (kiosk bearer + PIN) plus rate-limiting on the
 * clock endpoint make 10⁴ space adequate for the threat model.
 *
 * 2026-05-04: timeclock v1, sub-PR 3.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { hash } from "bcryptjs";
import { z } from "zod";

/**
 * GET /api/me/kiosk-pin — does the caller have a PIN set yet?
 *
 * Returns `{ pinSetAt: string | null }`. We deliberately don't return
 * the hash or anything that would distinguish "PIN is X" from
 * "PIN is Y" — `pinSetAt` is enough for the SetKioskPinCard to
 * decide between "Set PIN" vs "Change PIN".
 *
 * 2026-05-04 (timeclock v1, sub-PR 4): added alongside the
 * SetKioskPinCard widget on My Portal.
 */
export const GET = withApiAuth(async (_req, session) => {
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { kioskPinSetAt: true },
  });
  return NextResponse.json({ pinSetAt: me?.kioskPinSetAt ?? null });
});

const bodySchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
});

export const PATCH = withApiAuth(async (req, session) => {
  const raw = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }

  // Reject obviously-weak choices. Doesn't catch all bad PINs (e.g.
  // birthdays) but rules out the trivially common ones.
  const trivial = new Set([
    "0000",
    "1111",
    "2222",
    "3333",
    "4444",
    "5555",
    "6666",
    "7777",
    "8888",
    "9999",
    "1234",
    "4321",
  ]);
  if (trivial.has(parsed.data.pin)) {
    throw ApiError.badRequest(
      "Pick a less obvious PIN — a 4-digit run or all-same isn't allowed.",
    );
  }

  const pinHash = await hash(parsed.data.pin, 10);
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      kioskPinHash: pinHash,
      kioskPinSetAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
});
