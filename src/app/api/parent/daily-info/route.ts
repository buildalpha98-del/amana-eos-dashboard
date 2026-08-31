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

  const monday = getMondayUtc(now, SERVICE_TZ);

  // The WHOLE week, not just today. Parents plan lunches and pick-ups
  // around what's on — "what's for lunch Thursday" and "when is the
  // excursion" are week questions, and answering them one day at a time
  // meant they couldn't be answered at all. Today is derived from the
  // same fetch below rather than queried twice.
  const [menuWeeks, programs] = await Promise.all([
    prisma.menuWeek.findMany({
      where: {
        serviceId: { in: serviceIds },
        weekStart: monday,
      },
      include: {
        items: {
          orderBy: { slot: "asc" },
        },
      },
    }),
    prisma.programActivity.findMany({
      where: {
        serviceId: { in: serviceIds },
        weekStart: monday,
      },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        day: true,
        startTime: true,
        endTime: true,
        location: true,
        staffName: true,
        programmeBrand: true,
      },
    }),
  ]);

  const allItems = menuWeeks.flatMap((mw) =>
    mw.items.map((item) => ({
      day: item.day,
      slot: item.slot,
      description: item.description,
      allergens: item.allergens,
    })),
  );

  const WEEKDAYS: WeekDay[] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
  ];

  const week = WEEKDAYS.map((day) => ({
    day,
    menu: allItems.filter((i) => i.day === day),
    program: programs.filter((p) => p.day === day),
  }));

  // Today's slice, kept in the old shape so the Home card needs no
  // change to keep working. Weekend = null, as before.
  const todayItems = todayWeekDay
    ? allItems.filter((i) => i.day === todayWeekDay)
    : [];

  return NextResponse.json({
    todayMenu: todayItems.length > 0 ? { items: todayItems } : null,
    todayProgram: todayWeekDay
      ? programs.filter((p) => p.day === todayWeekDay)
      : [],
    week,
  });
});
