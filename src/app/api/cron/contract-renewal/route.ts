import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock } from "@/lib/cron-guard";

/**
 * GET /api/cron/contract-renewal
 *
 * Monthly cron (1st of month) — checks for services with contracts
 * expiring within 6 months where no recent principal visit exists.
 * Creates CoworkAnnouncement alerts for partnership attention.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("contract-renewal", "monthly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const sixMonthsFromNow = new Date(now);
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Find services where contract expires within 6 months
    const services = await prisma.service.findMany({
      where: {
        status: "active",
        contractEndDate: {
          not: null,
          lte: sixMonthsFromNow,
          gte: now, // not already expired
        },
      },
      select: {
        id: true,
        name: true,
        code: true,
        contractEndDate: true,
        lastPrincipalVisit: true,
        schoolPrincipalName: true,
      },
    });

    let alertsCreated = 0;

    for (const service of services) {
      const visitOverdue =
        !service.lastPrincipalVisit ||
        service.lastPrincipalVisit < ninetyDaysAgo;

      if (!visitOverdue) continue;

      const daysUntilExpiry = Math.ceil(
        (service.contractEndDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const lastVisitText = service.lastPrincipalVisit
        ? `${Math.floor((now.getTime() - service.lastPrincipalVisit.getTime()) / (1000 * 60 * 60 * 24))} days ago`
        : "Never recorded";

      await prisma.announcement.create({
        data: {
          serviceId: service.id,
          title: `Contract renewal approaching — ${service.name}`,
          body: `Contract for ${service.name} (${service.code}) expires in ${daysUntilExpiry} days (${service.contractEndDate!.toLocaleDateString("en-AU")}). Last principal visit: ${lastVisitText}. ${service.schoolPrincipalName ? `Principal: ${service.schoolPrincipalName}.` : ""} Schedule a renewal meeting.`,
          priority: daysUntilExpiry <= 90 ? "urgent" : "important",
          audience: "owners_admins",
          publishedAt: new Date(),
        },
      });
      alertsCreated++;
    }

    return NextResponse.json({
      message: "Contract renewal check complete",
      servicesChecked: services.length,
      alertsCreated,
    });
  } catch (err) {
    console.error("Contract renewal cron error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Contract renewal check failed" },
      { status: 500 }
    );
  }
}
