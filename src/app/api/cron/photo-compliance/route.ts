import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";

// ── Constants ───────────────────────────────────────────────
const CONSECUTIVE_MISS_THRESHOLD = 3;
const DEDUP_PHRASE = "Daily photos not confirmed";
const DEDUP_PHRASE_ESCALATION = "missed daily photos 3 days in a row";

/**
 * Format a Date as DD/MM (Australian format).
 */
function formatAU(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/**
 * Get "yesterday" in AEST (UTC+10).
 * Returns a plain date (no time component) suitable for the @db.Date column.
 */
function getYesterdayAEST(): Date {
  const now = new Date();
  // Shift to AEST
  now.setHours(now.getHours() + 10);
  // Go back one day
  now.setDate(now.getDate() - 1);
  // Strip time component → midnight UTC of that date
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * GET /api/cron/photo-compliance
 *
 * Daily cron that checks whether each centre confirmed their daily photos.
 * Creates follow-up tasks when they haven't, with escalation for streaks.
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("photo-compliance", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  const yesterday = getYesterdayAEST();
  const dateLabel = formatAU(yesterday);

  // Build the last N dates for consecutive-miss check
  const checkDates: Date[] = [];
  for (let i = 0; i < CONSECUTIVE_MISS_THRESHOLD; i++) {
    const d = new Date(yesterday);
    d.setDate(d.getDate() - i);
    checkDates.push(d);
  }

  // 1. Fetch all active services with their manager
  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: { id: true, name: true, code: true, managerId: true },
  });

  let compliant = 0;
  let nonCompliant = 0;
  let tasksCreated = 0;
  let escalations = 0;

  for (const svc of services) {
    // 2. Check if a PhotoComplianceLog exists for yesterday
    let log = await prisma.photoComplianceLog.findUnique({
      where: { serviceId_date: { serviceId: svc.id, date: yesterday } },
      select: { confirmed: true },
    });

    // If no entry exists, create one with confirmed: false
    if (!log) {
      await prisma.photoComplianceLog.create({
        data: { serviceId: svc.id, date: yesterday, confirmed: false },
      });
      log = { confirmed: false };
    }

    // 3. If confirmed, skip
    if (log.confirmed) {
      compliant++;
      continue;
    }

    nonCompliant++;

    // 4. Check consecutive misses (last N days)
    const confirmedLogs = await prisma.photoComplianceLog.findMany({
      where: {
        serviceId: svc.id,
        date: { in: checkDates },
        confirmed: true,
      },
      select: { date: true },
    });

    // Days that exist AND are confirmed
    const confirmedCount = confirmedLogs.length;
    // If zero confirmed out of the last N days, it's a streak
    const consecutiveMisses = CONSECUTIVE_MISS_THRESHOLD - confirmedCount;
    const isEscalation = consecutiveMisses >= CONSECUTIVE_MISS_THRESHOLD;

    if (isEscalation) {
      escalations++;
    }

    // 5. Determine task params based on escalation
    const dedupPhrase = isEscalation ? DEDUP_PHRASE_ESCALATION : DEDUP_PHRASE;
    const priority = isEscalation ? "high" : "medium";
    const title = isEscalation
      ? `⚠️ ${svc.name} has missed daily photos 3 days in a row — follow up with coordinator immediately`
      : `📸 ${svc.name}: Daily photos not confirmed for ${dateLabel}. Please upload to OWNA and WhatsApp.`;
    const description = isEscalation
      ? `Photo compliance escalation: ${svc.name} (${svc.code}) has not confirmed daily photo uploads for ${CONSECUTIVE_MISS_THRESHOLD} consecutive days. Please follow up with the centre coordinator to resolve immediately.`
      : `Photo compliance: ${svc.name} (${svc.code}) did not confirm daily photo upload for ${dateLabel}. Please ensure photos are uploaded to OWNA and shared in the WhatsApp parent group.`;

    // 6. Dedup check — skip if an open task already exists with the same phrase
    const existingTask = await prisma.marketingTask.findFirst({
      where: {
        serviceId: svc.id,
        status: { not: "done" },
        deleted: false,
        title: { contains: dedupPhrase },
      },
      select: { id: true },
    });

    if (existingTask) continue;

    // 7. Create the task
    const today = new Date();
    const dueDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    await prisma.marketingTask.create({
      data: {
        title,
        description,
        status: "todo",
        priority: priority as any,
        dueDate,
        assigneeId: svc.managerId || null,
        serviceId: svc.id,
      },
    });

    tasksCreated++;
  }

  const result = {
    message: "Photo compliance check complete",
    date: yesterday.toISOString().split("T")[0],
    servicesChecked: services.length,
    compliant,
    nonCompliant,
    tasksCreated,
    escalations,
  };

  await guard.complete(result);

  return NextResponse.json(result);
});
