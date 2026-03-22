import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { getOwnaClient } from "@/lib/owna";
import { syncOwnaService, todayISO } from "@/lib/owna-sync";
import type { ServiceSyncResult } from "@/lib/owna-sync";
import { withApiHandler } from "@/lib/api-handler";

// ── Cron Handler ──────────────────────────────────────────────

export const GET = withApiHandler(async (req) => {
  // 1. Auth
  const authCheck = verifyCronSecret(req);
  if (authCheck) return authCheck.error;

  // 2. Idempotency lock — use a half-hourly period key
  const now = new Date();
  const halfHourSlot = `${now.toISOString().split("T")[0]}-${now.getUTCHours().toString().padStart(2, "0")}${now.getUTCMinutes() < 30 ? "00" : "30"}`;

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
  const results: Record<string, ServiceSyncResult> = {};

  // 5. Sync each service
  for (const svc of services) {
    results[svc.code] = await syncOwnaService(
      svc.ownaServiceId!,
      svc.id,
      svc.code,
      owna,
    );
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
});
