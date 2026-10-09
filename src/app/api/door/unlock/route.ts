/**
 * POST /api/door/unlock — leave Parent mode with a staff member's
 * clock-in PIN (the same `kioskPinHash` the staff kiosk uses).
 * Auth: the paired iPad's kiosk bearer token.
 *
 * PIN only, no "tap your name" first: the screen is at a busy door and
 * any staff member at this centre may switch it. Five wrong tries locks
 * the iPad's unlock for five minutes; every unlock is logged.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authenticateKiosk } from "@/lib/kiosk-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const bodySchema = z.object({ pin: z.string().regex(/^\d{4,6}$/) });

export async function POST(req: Request) {
  const kiosk = await authenticateKiosk(req);
  if (!kiosk) return NextResponse.json({ error: "This iPad isn't set up as a door iPad." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your 4-digit PIN." }, { status: 400 });

  const rl = await checkRateLimit(`door-unlock:${kiosk.id}`, 5, 5 * 60_000);
  if (rl.limited) {
    return NextResponse.json({ error: "Too many wrong PINs. Try again in 5 minutes." }, { status: 429 });
  }

  const staff = await prisma.user.findMany({
    where: {
      active: true,
      kioskPinHash: { not: null },
      OR: [
        { serviceId: kiosk.serviceId },
        { serviceMemberships: { some: { serviceId: kiosk.serviceId, status: "active" } } },
      ],
    },
    select: { id: true, name: true, kioskPinHash: true },
  });
  for (const u of staff) {
    if (u.kioskPinHash && (await compare(parsed.data.pin, u.kioskPinHash))) {
      logger.info("Door iPad unlocked", { kioskId: kiosk.id, userId: u.id });
      return NextResponse.json({ ok: true, name: u.name });
    }
  }
  return NextResponse.json({ error: "That PIN didn't match. Try again." }, { status: 401 });
}
