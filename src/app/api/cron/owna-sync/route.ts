import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { getOwnaClient } from "@/lib/owna";
import type { SessionType } from "@prisma/client";

// ── Helpers ───────────────────────────────────────────────────

function mapSessionType(raw: string): SessionType | null {
  const map: Record<string, SessionType> = {
    BSC: "bsc",
    ASC: "asc",
    VC: "vc",
  };
  return map[raw.toUpperCase()] ?? null;
}

function todayISO(): string {
  // AEST is UTC+10 / AEDT is UTC+11
  // Use Australia/Sydney to get the correct local date
  const now = new Date();
  const aest = new Date(
    now.toLocaleString("en-US", { timeZone: "Australia/Sydney" }),
  );
  return aest.toISOString().split("T")[0];
}

// ── Cron Handler ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // 1. Auth
  const authCheck = verifyCronSecret(req);
  if (authCheck) return authCheck.error;

  // 2. Idempotency lock — use a half-hourly period key
  const now = new Date();
  const halfHourSlot = `${now.toISOString().split("T")[0]}-${now.getUTCHours().toString().padStart(2, "0")}${now.getUTCMinutes() < 30 ? "00" : "30"}`;

  // Use acquireCronLock with a synthetic daily key to prevent overlap
  const guard = await acquireCronLock(`owna-sync-${halfHourSlot}`, "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  // 3. Check OWNA client is configured
  const owna = getOwnaClient();
  if (!owna) {
    await guard.complete({ skipped: true, reason: "OWNA not configured" });
    return NextResponse.json({
      message: "OWNA API not configured — skipping sync",
      skipped: true,
    });
  }

  // 4. Fetch all services with OWNA mapping
  const services = await prisma.service.findMany({
    where: {
      status: "active",
      ownaServiceId: { not: null },
    },
    select: {
      id: true,
      code: true,
      ownaServiceId: true,
    },
  });

  if (services.length === 0) {
    await guard.complete({ skipped: true, reason: "No services mapped" });
    return NextResponse.json({
      message: "No services with OWNA mapping — skipping",
      skipped: true,
    });
  }

  const today = todayISO();
  const results: Record<
    string,
    { attendance: number; bookings: number; roster: number; error?: string }
  > = {};

  // 5. Sync each service
  for (const svc of services) {
    const serviceCode = svc.ownaServiceId!;
    const stats = { attendance: 0, bookings: 0, roster: 0, error: undefined as string | undefined };

    try {
      // ── Attendance ────────────────────────────────────────
      try {
        const attendance = await owna.getAttendance(serviceCode, today, today);
        if (attendance.length > 0) {
          await prisma.$transaction(
            attendance
              .filter((r) => mapSessionType(r.sessionType))
              .map((r) => {
                const sessionType = mapSessionType(r.sessionType)!;
                return prisma.dailyAttendance.upsert({
                  where: {
                    serviceId_date_sessionType: {
                      serviceId: svc.id,
                      date: new Date(`${r.date}T00:00:00Z`),
                      sessionType,
                    },
                  },
                  update: {
                    enrolled: r.enrolled,
                    attended: r.attended,
                    absent: r.absent,
                    casual: r.casual,
                    capacity: r.capacity,
                  },
                  create: {
                    serviceId: svc.id,
                    date: new Date(`${r.date}T00:00:00Z`),
                    sessionType,
                    enrolled: r.enrolled,
                    attended: r.attended,
                    absent: r.absent,
                    casual: r.casual,
                    capacity: r.capacity,
                  },
                });
              }),
          );
          stats.attendance = attendance.length;
        }
      } catch (err) {
        console.error(`[OWNA] Attendance sync failed for ${svc.code}:`, err);
        stats.error = `attendance: ${err instanceof Error ? err.message : String(err)}`;
      }

      // ── Bookings ──────────────────────────────────────────
      try {
        const bookings = await owna.getBookings(serviceCode, today, today);
        if (bookings.length > 0) {
          await prisma.$transaction(
            bookings
              .filter((r) => mapSessionType(r.sessionType))
              .map((r) => {
                const sessionType = mapSessionType(r.sessionType)!;
                return prisma.bookingForecast.upsert({
                  where: {
                    serviceId_date_sessionType: {
                      serviceId: svc.id,
                      date: new Date(`${r.date}T00:00:00Z`),
                      sessionType,
                    },
                  },
                  update: {
                    regular: r.regular,
                    casual: r.casual,
                    total: r.total,
                    capacity: r.capacity,
                    syncedAt: new Date(),
                  },
                  create: {
                    serviceId: svc.id,
                    date: new Date(`${r.date}T00:00:00Z`),
                    sessionType,
                    regular: r.regular,
                    casual: r.casual,
                    total: r.total,
                    capacity: r.capacity,
                  },
                });
              }),
          );
          stats.bookings = bookings.length;
        }
      } catch (err) {
        console.error(`[OWNA] Bookings sync failed for ${svc.code}:`, err);
        const msg = `bookings: ${err instanceof Error ? err.message : String(err)}`;
        stats.error = stats.error ? `${stats.error}; ${msg}` : msg;
      }

      // ── Roster ────────────────────────────────────────────
      try {
        const roster = await owna.getRoster(serviceCode, today, today);
        if (roster.length > 0) {
          // Delete existing roster for this day then insert fresh
          await prisma.rosterShift.deleteMany({
            where: {
              serviceId: svc.id,
              date: new Date(`${today}T00:00:00Z`),
            },
          });

          await prisma.$transaction(
            roster
              .filter((r) => mapSessionType(r.sessionType))
              .map((r) =>
                prisma.rosterShift.create({
                  data: {
                    serviceId: svc.id,
                    date: new Date(`${r.date}T00:00:00Z`),
                    sessionType: mapSessionType(r.sessionType)!,
                    staffName: r.staffName,
                    shiftStart: r.shiftStart,
                    shiftEnd: r.shiftEnd,
                    role: r.role ?? null,
                  },
                }),
              ),
          );
          stats.roster = roster.length;
        }
      } catch (err) {
        console.error(`[OWNA] Roster sync failed for ${svc.code}:`, err);
        const msg = `roster: ${err instanceof Error ? err.message : String(err)}`;
        stats.error = stats.error ? `${stats.error}; ${msg}` : msg;
      }

      // ── Update last sync timestamp ────────────────────────
      await prisma.service.update({
        where: { id: svc.id },
        data: { ownaSyncedAt: new Date() },
      });
    } catch (err) {
      console.error(`[OWNA] Full sync failed for ${svc.code}:`, err);
      stats.error = err instanceof Error ? err.message : String(err);
    }

    results[svc.code] = stats;
  }

  await guard.complete({
    servicesProcessed: services.length,
    results,
  });

  return NextResponse.json({
    message: "OWNA sync completed",
    date: today,
    servicesProcessed: services.length,
    results,
  });
}
