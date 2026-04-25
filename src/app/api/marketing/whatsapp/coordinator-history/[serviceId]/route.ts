import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import {
  COORDINATOR_WEEKLY_FLOOR,
  COORDINATOR_WEEKLY_TARGET,
  formatIsoDate,
  getWeekBounds,
  resolveCoordinatorForService,
  tallyServiceWeek,
} from "@/lib/whatsapp-compliance";

const WEEKS_BACK = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

function statusFor(posted: number): "green" | "amber" | "red" {
  if (posted >= COORDINATOR_WEEKLY_TARGET) return "green";
  if (posted >= COORDINATOR_WEEKLY_FLOOR) return "amber";
  return "red";
}

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const params = await context?.params;
    const serviceId = params?.serviceId;
    if (!serviceId) throw ApiError.badRequest("serviceId required");

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, name: true },
    });
    if (!service) throw ApiError.notFound("Service not found");

    const coord = await resolveCoordinatorForService(serviceId);
    const now = new Date();
    const currentWeek = getWeekBounds(now);

    const weeks = [];
    for (let i = WEEKS_BACK - 1; i >= 0; i--) {
      const referenceDate = new Date(currentWeek.start.getTime() - i * 7 * DAY_MS);
      const wb = getWeekBounds(referenceDate);
      const tally = await tallyServiceWeek({ serviceId, weekStart: wb.start });
      weeks.push({
        weekStart: formatIsoDate(wb.start),
        weekNumber: wb.weekNumber,
        year: wb.year,
        posted: tally.posted,
        notPosted: tally.notPosted,
        notChecked: tally.notChecked,
        excluded: tally.excluded,
        coverage: tally.posted + tally.notPosted,
        floor: COORDINATOR_WEEKLY_FLOOR,
        target: COORDINATOR_WEEKLY_TARGET,
        status: statusFor(tally.posted),
      });
    }

    const recentNotes = await prisma.whatsAppCoordinatorPost.findMany({
      where: {
        serviceId,
        notes: { not: null },
        postedDate: { gte: new Date(currentWeek.start.getTime() - WEEKS_BACK * 7 * DAY_MS) },
      },
      orderBy: { postedDate: "desc" },
      select: { id: true, postedDate: true, notes: true, posted: true, notPostingReason: true },
      take: 50,
    });

    return NextResponse.json({
      serviceId: service.id,
      serviceName: service.name,
      coordinatorName: coord?.name ?? null,
      coordinatorUserId: coord?.id ?? null,
      weeks,
      notes: recentNotes.map((n) => ({
        id: n.id,
        date: formatIsoDate(n.postedDate),
        notes: n.notes,
        posted: n.posted,
        notPostingReason: n.notPostingReason,
      })),
    });
  },
  { roles: ["marketing", "owner"] },
);
