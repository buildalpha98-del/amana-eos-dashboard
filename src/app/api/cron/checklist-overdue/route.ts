/**
 * GET /api/cron/checklist-overdue — every 15 minutes, weekday trading hours.
 *
 * For each centre that has set checklist due times (Settings → Checklists),
 * any section still missing required ticks past its due time sends ONE
 * in-app + push reminder to the educators on shift for that session and
 * the centre's Director(s) / manager. One per section per day: the title
 * is the dedupe key, so the next run (and a re-run) stays quiet.
 *
 * Not behind the service-alert email pause on purpose: it is staff-facing,
 * sends no email, and does nothing until a centre opts in with due times.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { notifyUsers } from "@/lib/notify-user";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { resolveAppSettings } from "@/lib/app-settings";
import { getChecklistStatusToday, serviceLocalToday } from "@/lib/checklist-due-server";
import { overdueTitle, sectionLabel } from "@/lib/checklist-due";

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("checklist-overdue", "15min");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const { date } = serviceLocalToday(now);
    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, managerId: true, appSettings: true },
    });
    const opted = services.filter((s) => {
      const due = resolveAppSettings(s.appSettings).checklists.dueTimes;
      return Object.values(due).some((v) => v && Object.keys(v).length > 0);
    });

    let sent = 0;
    for (const svc of opted) {
      const { sections, hhmm } = await getChecklistStatusToday(svc.id, now);
      const overdue = sections.filter((s) => s.overdue);
      if (overdue.length === 0) continue;

      const [shifts, directors] = await Promise.all([
        prisma.rosterShift.findMany({
          where: { serviceId: svc.id, date, userId: { not: null } },
          select: { userId: true, sessionType: true, shiftStart: true, shiftEnd: true },
        }),
        prisma.user.findMany({
          where: { serviceId: svc.id, role: "member", active: true },
          select: { id: true },
        }),
      ]);

      for (const s of overdue) {
        const title = overdueTitle(svc.name, s);
        const already = await prisma.userNotification.findFirst({
          // 20h window, not "since midnight": the @db.Date midnight is UTC,
          // which is 10-11am Sydney — morning reminders would repeat.
          where: { type: NOTIFICATION_TYPES.CHECKLIST_OVERDUE, title, createdAt: { gte: new Date(now.getTime() - 20 * 3600_000) } },
          select: { id: true },
        });
        if (already) continue;

        const onShift = shifts
          .filter((sh) => sh.sessionType === s.sessionType && sh.shiftStart <= hhmm && sh.shiftEnd > hhmm)
          .map((sh) => sh.userId as string);
        const recipients = [...onShift, ...directors.map((d) => d.id), svc.managerId ?? ""];
        const body = s.missing
          ? `Not started yet — it was due at ${s.due}.`
          : `${s.total - s.done} item${s.total - s.done === 1 ? "" : "s"} still to tick — due at ${s.due}.`;
        sent += await notifyUsers(prisma, recipients, {
          type: NOTIFICATION_TYPES.CHECKLIST_OVERDUE,
          title,
          body: `${sectionLabel(s.category)}: ${body}`,
          link: `/services/${svc.id}?tab=daily&sub=checklists`,
        });
      }
    }

    await guard.complete({ centres: opted.length, sent });
    return NextResponse.json({ centres: opted.length, sent });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
