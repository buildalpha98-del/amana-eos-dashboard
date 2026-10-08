/**
 * Today's checklist status for one centre — the shared read behind the
 * overdue-reminder cron and the Today card. Dates are the centre's local
 * day (Australia/Sydney) as a UTC-midnight @db.Date, the same shape the
 * Cowork checklist ingest writes.
 */
import { prisma } from "@/lib/prisma";
import { resolveAppSettings } from "@/lib/app-settings";
import { getLocalDateParts } from "@/lib/timezone";
import { checklistStatus, type SectionStatus } from "@/lib/checklist-due";

export function serviceLocalToday(now: Date = new Date()) {
  const p = getLocalDateParts(now);
  return {
    date: new Date(Date.UTC(p.year, p.month - 1, p.day)),
    hhmm: `${String(p.hour % 24).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
    dayOfWeek: p.dayOfWeek,
  };
}

export async function getChecklistStatusToday(
  serviceId: string,
  now: Date = new Date(),
): Promise<{ sections: SectionStatus[]; hhmm: string; hasDueTimes: boolean }> {
  const { date, hhmm } = serviceLocalToday(now);
  const [service, checklists, shifts] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId }, select: { appSettings: true } }),
    prisma.dailyChecklist.findMany({
      where: { serviceId, date },
      select: {
        sessionType: true,
        items: { select: { category: true, checked: true, isRequired: true } },
      },
    }),
    prisma.rosterShift.findMany({
      where: { serviceId, date },
      select: { sessionType: true },
    }),
  ]);
  const dueTimes = resolveAppSettings(service?.appSettings).checklists.dueTimes;
  const running = new Set(shifts.map((s) => s.sessionType as string));
  return {
    sections: checklistStatus(checklists, dueTimes, hhmm, running),
    hhmm,
    hasDueTimes: Object.values(dueTimes).some((v) => v && Object.keys(v).length > 0),
  };
}
