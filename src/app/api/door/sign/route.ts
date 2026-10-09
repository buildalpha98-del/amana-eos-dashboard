/**
 * POST /api/door/sign — a parent signs their child(ren) in or out on the
 * door iPad. Auth: the paired iPad's kiosk bearer token.
 *
 * Every rule is checked HERE, not just on the screen: the child is booked
 * today at this iPad's centre, isn't one an educator must hand over, the
 * adult is a parent / guardian on that child's enrolment, and a signature
 * comes with it when the centre requires one. The write itself is the same
 * code the staff door screen uses (recordHandover).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import type { SessionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateKiosk } from "@/lib/kiosk-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { serviceTodayISO } from "@/lib/timezone";
import { resolveAppSettings } from "@/lib/app-settings";
import { doorAdults, doorStateOf, needsEducator } from "@/lib/door";
import { recordHandover, syncDailyAttendance } from "@/lib/attendance-handover";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  sessionType: z.string().min(1).max(20),
  childIds: z.array(z.string().min(1)).min(1).max(8),
  action: z.enum(["sign_in", "sign_out"]),
  adult: z.enum(["primary", "secondary"]),
  signature: z.string().max(200_000).optional(),
});

const err = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const kiosk = await authenticateKiosk(req);
  if (!kiosk) return err(401, "This iPad isn't set up as a door iPad.");

  const rl = await checkRateLimit(`door-sign:${kiosk.id}`, 60, 60_000);
  if (rl.limited) return err(429, "Too many sign-ins at once. Wait a moment and try again.");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(400, "Something was missing. Please start again.");
  const { childIds, action, adult, signature } = parsed.data;
  const sessionType = parsed.data.sessionType as SessionType;

  const date = new Date(`${serviceTodayISO()}T00:00:00Z`);
  const [service, bookings, records] = await Promise.all([
    prisma.service.findUnique({ where: { id: kiosk.serviceId }, select: { appSettings: true } }),
    prisma.booking.findMany({
      where: {
        serviceId: kiosk.serviceId,
        date,
        sessionType,
        childId: { in: childIds },
        status: { in: ["confirmed", "requested"] },
      },
      select: {
        child: {
          select: {
            id: true,
            custodyArrangements: true,
            enrolment: { select: { primaryParent: true, secondaryParent: true, courtOrders: true } },
          },
        },
      },
    }),
    prisma.attendanceRecord.findMany({
      where: { serviceId: kiosk.serviceId, date, sessionType, childId: { in: childIds } },
      select: { childId: true, status: true, signOutTime: true },
    }),
  ]);

  if (bookings.length !== new Set(childIds).size) {
    return err(404, "We couldn't find that booking for today. Please see an educator.");
  }
  if (bookings.some((b) => needsEducator(b.child, b.child.enrolment))) {
    return err(403, "Please see an educator.");
  }
  // The same adult must be a parent / guardian of EVERY child signed.
  const names = bookings.map((b) => doorAdults(b.child.enrolment).find((a) => a.key === adult)?.fullName);
  if (names.some((n) => !n)) return err(403, "Please see an educator.");
  if (resolveAppSettings(service?.appSettings).signInOut.requireSignature && !signature) {
    return err(400, "Please sign before confirming.");
  }

  const stateOf = new Map(records.map((r) => [r.childId, doorStateOf(r)]));
  for (const id of childIds) {
    const state = stateOf.get(id) ?? "arriving";
    if (action === "sign_in" && state !== "arriving") return err(409, "Already signed in. Please see an educator.");
    if (action === "sign_out" && state !== "here") return err(409, "Not signed in yet. Please see an educator.");
  }

  const at = new Date();
  for (const id of childIds) {
    await recordHandover({
      childId: id,
      serviceId: kiosk.serviceId,
      date,
      sessionType,
      action,
      at,
      recordedById: null,
      signedByName: names[0]!,
      signMethod: "parent_kiosk",
      signature,
    });
  }
  await syncDailyAttendance(kiosk.serviceId, date, sessionType, null);
  logger.info("Door iPad hand-over", { kioskId: kiosk.id, action, count: childIds.length });
  return NextResponse.json({ ok: true, name: names[0], at: at.toISOString() });
}
