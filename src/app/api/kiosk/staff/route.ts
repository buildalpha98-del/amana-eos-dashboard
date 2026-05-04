/**
 * GET /api/kiosk/staff
 *
 * Returns the staff list for the kiosk's service so the tablet can
 * render a face/name grid for staff to tap. Auth: kiosk bearer.
 *
 * Includes only active users with a kioskPinHash set — no point
 * showing someone who can't actually clock in (they'd have to set
 * their PIN in My Portal first).
 *
 * 2026-05-04: timeclock v1, sub-PR 3.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateKiosk } from "@/lib/kiosk-auth";

export async function GET(req: Request) {
  const kiosk = await authenticateKiosk(req);
  if (!kiosk) {
    return NextResponse.json(
      { error: "Kiosk not authorised." },
      { status: 401 },
    );
  }

  const staff = await prisma.user.findMany({
    where: {
      serviceId: kiosk.serviceId,
      active: true,
      kioskPinHash: { not: null },
    },
    select: {
      id: true,
      name: true,
      avatar: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ staff });
}
