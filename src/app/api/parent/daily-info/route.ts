import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { getLocalDateParts, getMondayUtc, SERVICE_TZ } from "@/lib/timezone";
import type { WeekDay } from "@prisma/client";

const WEEKDAY_MAP: Record<number, WeekDay> = {
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
};

export const GET = withParentAuth(async (_req, { parent }) => {
  if (parent.enrolmentIds.length === 0) {
    return NextResponse.json({ todayMenu: null, todayProgram: [] });
  }

  // Get the parent's serviceIds from enrolments
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true },
  });

  const serviceIds = [...new Set(enrolments.map((e) => e.serviceId).filter((s): s is string => !!s))];
  if (serviceIds.length === 0) {
    return NextResponse.json({ todayMenu: null, todayProgram: [] });
  }

  // Use the Intl-based utility — correct in all timezones and DST transitions
  const now = new Date();
  const local = getLocalDateParts(now, SERVICE_TZ);
  const todayWeekDay = WEEKDAY_MAP[local.dayOfWeek];

  // If weekend, no menu/program
  if (!todayWeekDay) {
    return NextResponse.json({ todayMenu: null, todayProgram: [] });
  }

  const monday = getMondayUtc(now, SERVICE_TZ);

  // Fetch menu and programs in parallel
  const [menuWeeks, programs] = await Promise.all([
    prisma.menuWeek.findMany({
      where: {
        serviceId: { in: serviceIds },
        weekStart: monday,
      },
      include: {
        items: {
          where: { day: todayWeekDay },
          orderBy: { slot: "asc" },
        },
      },
    }),
    prisma.programActivity.findMany({
      where: {
        serviceId: { in: serviceIds },
        weekStart: monday,
        day: todayWeekDay,
      },
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        startTime: true,
        endTime: true,
        location: true,
        staffName: true,
        programmeBrand: true,
      },
    }),
  ]);

  // Flatten menu items from all services
  const todayMenu = menuWeeks.length > 0
    ? {
        items: menuWeeks.flatMap((mw) =>
          mw.items.map((item) => ({
            slot: item.slot,
            description: item.description,
            allergens: item.allergens,
          })),
        ),
      }
    : null;

  return NextResponse.json({
    todayMenu,
    todayProgram: programs,
  });
});
