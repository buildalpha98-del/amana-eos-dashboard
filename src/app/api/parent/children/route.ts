import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";

export const GET = withParentAuth(async (_req, { parent }) => {
  if (parent.enrolmentIds.length === 0) {
    return NextResponse.json({ children: [] });
  }

  // Get children from enrolment submissions
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: {
      id: { in: parent.enrolmentIds },
      status: { not: "draft" },
    },
    select: {
      id: true,
      children: true,
      serviceId: true,
      childRecords: {
        select: {
          id: true,
          firstName: true,
          surname: true,
          yearLevel: true,
          schoolName: true,
          serviceId: true,
          status: true,
          service: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  // Get attendance data for the last 7 days by service
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const serviceIds = new Set<string>();
  for (const e of enrolments) {
    if (e.serviceId) serviceIds.add(e.serviceId);
    for (const c of e.childRecords) {
      if (c.serviceId) serviceIds.add(c.serviceId);
    }
  }

  const attendanceRecords = serviceIds.size > 0
    ? await prisma.dailyAttendance.findMany({
        where: {
          serviceId: { in: Array.from(serviceIds) },
          date: { gte: sevenDaysAgo },
        },
        select: {
          serviceId: true,
          date: true,
          sessionType: true,
          attended: true,
          absent: true,
          enrolled: true,
        },
        orderBy: { date: "desc" },
      })
    : [];

  // Build attendance summary per service (aggregate — we don't have per-child attendance)
  const attendanceBySvc = new Map<
    string,
    { totalDays: number; totalAttended: number; totalAbsent: number }
  >();

  for (const rec of attendanceRecords) {
    const existing = attendanceBySvc.get(rec.serviceId) || {
      totalDays: 0,
      totalAttended: 0,
      totalAbsent: 0,
    };
    existing.totalDays++;
    existing.totalAttended += rec.attended;
    existing.totalAbsent += rec.absent;
    attendanceBySvc.set(rec.serviceId, existing);
  }

  // Build children list
  const children: Array<{
    id: string;
    firstName: string;
    surname: string;
    yearLevel: string | null;
    schoolName: string | null;
    serviceId: string | null;
    serviceName: string | null;
    status: string;
    attendanceSummary: {
      totalSessions: number;
      totalAttended: number;
      totalAbsent: number;
      periodDays: number;
    };
  }> = [];

  for (const enrolment of enrolments) {
    if (enrolment.childRecords.length > 0) {
      for (const child of enrolment.childRecords) {
        const svcId = child.serviceId || enrolment.serviceId;
        const svcAttendance = svcId ? attendanceBySvc.get(svcId) : null;

        children.push({
          id: child.id,
          firstName: child.firstName,
          surname: child.surname,
          yearLevel: child.yearLevel,
          schoolName: child.schoolName,
          serviceId: child.service?.id ?? child.serviceId,
          serviceName: child.service?.name ?? null,
          status: child.status,
          attendanceSummary: {
            totalSessions: svcAttendance?.totalDays ?? 0,
            totalAttended: svcAttendance?.totalAttended ?? 0,
            totalAbsent: svcAttendance?.totalAbsent ?? 0,
            periodDays: 7,
          },
        });
      }
    } else {
      // Fallback: parse children JSON
      const childrenJson = enrolment.children as Array<Record<string, unknown>> | null;
      if (Array.isArray(childrenJson)) {
        for (const child of childrenJson) {
          const svcAttendance = enrolment.serviceId
            ? attendanceBySvc.get(enrolment.serviceId)
            : null;

          children.push({
            id: `${enrolment.id}_${child.firstName}_${child.surname}`,
            firstName: (child.firstName as string) || "",
            surname: (child.surname as string) || "",
            yearLevel: (child.yearLevel as string) || null,
            schoolName: (child.school as string) || (child.schoolName as string) || null,
            serviceId: enrolment.serviceId,
            serviceName: null,
            status: "pending",
            attendanceSummary: {
              totalSessions: svcAttendance?.totalDays ?? 0,
              totalAttended: svcAttendance?.totalAttended ?? 0,
              totalAbsent: svcAttendance?.totalAbsent ?? 0,
              periodDays: 7,
            },
          });
        }
      }
    }
  }

  return NextResponse.json({ children });
});
