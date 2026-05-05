import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import {
  COORDINATOR_WEEKLY_FLOOR,
  COORDINATOR_WEEKLY_TARGET,
  formatIsoDate,
  getWeekBounds,
  getWeekdaysInWeek,
  resolveCoordinatorForService,
} from "@/lib/whatsapp-compliance";
import { WhatsAppNonPostReason } from "@prisma/client";

const WEEKS_BACK = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

const LEAVE_LIKE = new Set<WhatsAppNonPostReason>([
  WhatsAppNonPostReason.coordinator_on_leave,
  WhatsAppNonPostReason.school_closure,
  WhatsAppNonPostReason.public_holiday,
]);

function statusFor(posted: number): "green" | "amber" | "red" {
  if (posted >= COORDINATOR_WEEKLY_TARGET) return "green";
  if (posted >= COORDINATOR_WEEKLY_FLOOR) return "amber";
  return "red";
}

export const GET = withApiAuth(
  async () => {
    const now = new Date();
    const currentWeek = getWeekBounds(now);

    const weekBounds: ReturnType<typeof getWeekBounds>[] = [];
    for (let i = WEEKS_BACK - 1; i >= 0; i--) {
      const ref = new Date(currentWeek.start.getTime() - i * 7 * DAY_MS);
      weekBounds.push(getWeekBounds(ref));
    }

    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const earliest = weekBounds[0].start;
    const latest = weekBounds[weekBounds.length - 1].end;

    const records = await prisma.whatsAppCoordinatorPost.findMany({
      where: {
        serviceId: { in: services.map((s) => s.id) },
        postedDate: { gte: earliest, lte: latest },
      },
      select: {
        serviceId: true,
        postedDate: true,
        posted: true,
        notPostingReason: true,
      },
    });

    const recordMap = new Map<string, { posted: boolean; reason: WhatsAppNonPostReason | null }>();
    for (const r of records) {
      recordMap.set(`${r.serviceId}__${formatIsoDate(r.postedDate)}`, {
        posted: r.posted,
        reason: r.notPostingReason,
      });
    }

    const coordinators = await Promise.all(
      services.map(async (s) => ({
        serviceId: s.id,
        coord: await resolveCoordinatorForService(s.id),
      })),
    );
    const coordByService = new Map(coordinators.map((c) => [c.serviceId, c.coord]));

    const weeks = weekBounds.map((wb) => ({
      weekStart: formatIsoDate(wb.start),
      weekNumber: wb.weekNumber,
      year: wb.year,
    }));

    const serviceRows = services.map((svc) => {
      const coord = coordByService.get(svc.id);
      const weeklyData = weekBounds.map((wb) => {
        const days = getWeekdaysInWeek(wb.start);
        let posted = 0;
        let notPosted = 0;
        let notChecked = 0;
        let excluded = 0;

        for (const day of days) {
          const key = `${svc.id}__${formatIsoDate(day)}`;
          const rec = recordMap.get(key);
          if (!rec) {
            notChecked++;
          } else if (rec.posted) {
            posted++;
          } else if (rec.reason && LEAVE_LIKE.has(rec.reason)) {
            excluded++;
          } else {
            notPosted++;
          }
        }

        return {
          posted,
          notPosted,
          notChecked,
          excluded,
          status: statusFor(posted),
        };
      });

      const totalPosted = weeklyData.reduce((s, w) => s + w.posted, 0);
      const totalDays = weeklyData.length * 5;
      const totalExcluded = weeklyData.reduce((s, w) => s + w.excluded, 0);
      const effectiveDays = totalDays - totalExcluded;
      const complianceRate = effectiveDays > 0 ? Math.round((totalPosted / effectiveDays) * 100) : 0;

      return {
        serviceId: svc.id,
        serviceName: svc.name,
        coordinatorName: coord?.name ?? null,
        weeks: weeklyData,
        complianceRate,
      };
    });

    return NextResponse.json({
      weeks,
      services: serviceRows,
      target: COORDINATOR_WEEKLY_TARGET,
      floor: COORDINATOR_WEEKLY_FLOOR,
    });
  },
  { roles: ["marketing", "owner"] },
);
