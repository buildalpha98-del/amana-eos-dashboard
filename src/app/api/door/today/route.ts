/**
 * GET /api/door/today — the door iPad's Parent mode list.
 * Auth: the paired iPad's kiosk bearer token (no staff session).
 *
 * Shared-screen privacy: first name + surname INITIAL, no medical, no
 * custody detail — only a `needsEducator` flag the screen turns into
 * "Please see an educator".
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateKiosk } from "@/lib/kiosk-auth";
import { getLocalDateParts, serviceTodayISO } from "@/lib/timezone";
import { resolveAppSettings } from "@/lib/app-settings";
import { doorAdults, doorStateOf, needsEducator } from "@/lib/door";

export async function GET(req: Request) {
  const kiosk = await authenticateKiosk(req);
  if (!kiosk) return NextResponse.json({ error: "This iPad isn't set up as a door iPad." }, { status: 401 });

  const date = new Date(`${serviceTodayISO()}T00:00:00Z`);
  const [service, rooms, bookings, records] = await Promise.all([
    prisma.service.findUnique({ where: { id: kiosk.serviceId }, select: { name: true, appSettings: true } }),
    prisma.room.findMany({
      where: { serviceId: kiosk.serviceId, archivedAt: null, legacyKey: { not: null } },
      select: { legacyKey: true, name: true, sortOrder: true, startTime: true, endTime: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.booking.findMany({
      where: { serviceId: kiosk.serviceId, date, status: { in: ["confirmed", "requested"] } },
      select: {
        sessionType: true,
        child: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            photo: true,
            custodyArrangements: true,
            enrolment: { select: { id: true, primaryParent: true, secondaryParent: true, courtOrders: true } },
          },
        },
      },
    }),
    prisma.attendanceRecord.findMany({
      where: { serviceId: kiosk.serviceId, date },
      select: { childId: true, sessionType: true, status: true, signOutTime: true },
    }),
  ]);
  const recordOf = new Map(records.map((r) => [`${r.childId}:${r.sessionType}`, r]));

  const children = bookings
    .map((b) => ({
      childId: b.child.id,
      sessionType: b.sessionType,
      firstName: b.child.firstName,
      initial: (b.child.surname[0] ?? "").toUpperCase(),
      photo: b.child.photo,
      state: doorStateOf(recordOf.get(`${b.child.id}:${b.sessionType}`)),
      needsEducator: needsEducator(b.child, b.child.enrolment),
      // Siblings share an enrolment, so a parent can sign them together.
      family: b.child.enrolment?.id ?? b.child.id,
      // First names only on the shared screen; the full name is written
      // to the register server-side.
      adults: doorAdults(b.child.enrolment).map((a) => ({
        key: a.key,
        firstName: a.firstName,
        relationship: a.relationship,
      })),
    }))
    .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.initial.localeCompare(b.initial));

  const bookedKeys = new Set(children.map((c) => c.sessionType));
  const todaysRooms = rooms.filter((r) => r.legacyKey && bookedKeys.has(r.legacyKey));
  // Open on the session that's running or next — not the morning one at
  // 3pm. "HH:MM" strings compare correctly as text.
  const { hour, minute } = getLocalDateParts();
  const now = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const current =
    todaysRooms.find((r) => !r.endTime || r.endTime > now) ?? todaysRooms[todaysRooms.length - 1];

  return NextResponse.json({
    service: { id: kiosk.serviceId, name: service?.name ?? kiosk.label },
    requireSignature: resolveAppSettings(service?.appSettings).signInOut.requireSignature,
    rooms: todaysRooms.map((r) => ({ sessionType: r.legacyKey, name: r.name })),
    currentSessionType: current?.legacyKey ?? null,
    children,
  });
}
