import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { acquireCronLock } from "@/lib/cron-guard";
import { sendUnsignedInAlert } from "@/lib/notifications/cron";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/unsigned-in-alert
 *
 * Runs weekdays at 8:00am AEST (22:00 UTC previous day).
 * Finds children with BSC bookings who haven't been signed in or marked absent,
 * then emails the service coordinator.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("unsigned-in-alert", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    // Today in AEST
    const now = new Date();
    const aestDate = new Date(
      now.toLocaleString("en-US", { timeZone: "Australia/Sydney" }),
    );
    aestDate.setHours(0, 0, 0, 0);

    // Skip weekends
    const day = aestDate.getDay();
    if (day === 0 || day === 6) {
      return NextResponse.json({ message: "Skipped — weekend", alerts: 0 });
    }

    // Get all active services
    const services = await prisma.service.findMany({
      where: { status: { in: ["active", "onboarding"] } },
      select: {
        id: true,
        name: true,
        managerId: true,
      },
    });

    let alertsSent = 0;

    for (const service of services) {
      // Find all attendance records for today's BSC session that are still "booked"
      const unsignedIn = await prisma.attendanceRecord.findMany({
        where: {
          serviceId: service.id,
          date: aestDate,
          sessionType: "bsc",
          status: "booked",
        },
        select: {
          child: { select: { firstName: true, surname: true } },
        },
      });

      if (unsignedIn.length === 0) continue;

      // Find the service coordinator (manager or admin for this service)
      const coordinator = service.managerId
        ? await prisma.user.findUnique({
            where: { id: service.managerId },
            select: { name: true, email: true },
          })
        : null;

      // Fallback: find any coordinator/admin for the service
      const recipient = coordinator ??
        (await prisma.user.findFirst({
          where: {
            role: { in: ["coordinator", "admin", "owner"] },
            active: true,
          },
          select: { name: true, email: true },
          orderBy: { role: "asc" },
        }));

      if (!recipient) {
        logger.warn("No coordinator found for unsigned-in alert", { serviceId: service.id });
        continue;
      }

      await sendUnsignedInAlert(
        service.id,
        service.name,
        recipient.email,
        recipient.name,
        aestDate,
        unsignedIn.map((r) => r.child),
      );
      alertsSent++;
    }

    await guard.complete({ servicesChecked: services.length, alertsSent });

    return NextResponse.json({
      message: "Unsigned-in alerts processed",
      date: aestDate.toISOString().split("T")[0],
      servicesChecked: services.length,
      alertsSent,
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("Unsigned-in alert cron failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
});
