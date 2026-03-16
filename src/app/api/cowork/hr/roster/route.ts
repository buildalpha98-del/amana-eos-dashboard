import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";

/**
 * GET /api/cowork/hr/roster
 *
 * Returns roster shifts with ratio validation data.
 * Scope: hr:read
 *
 * Query params:
 *   - serviceId (optional)
 *   - date (ISO date, default today)
 *   - from / to (ISO date range, alternative to single date)
 */
export async function GET(req: NextRequest) {
  const { error: authError } = await authenticateApiKey(req, "hr:read");
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const date = searchParams.get("date");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    let dateFilter: Record<string, unknown>;
    if (from && to) {
      dateFilter = { gte: new Date(from), lte: new Date(to) };
    } else {
      const targetDate = date ? new Date(date) : new Date();
      targetDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      dateFilter = { gte: targetDate, lt: nextDay };
    }

    const where: Record<string, unknown> = { date: dateFilter };
    if (serviceId) where.serviceId = serviceId;

    // Get shifts
    const shifts = await prisma.rosterShift.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, code: true, state: true } },
      },
      orderBy: [{ date: "asc" }, { shiftStart: "asc" }],
    });

    // Get attendance for the same period to calculate ratios
    const attendance = await prisma.dailyAttendance.findMany({
      where: {
        date: dateFilter,
        ...(serviceId ? { serviceId } : {}),
      },
      select: {
        serviceId: true,
        date: true,
        sessionType: true,
        enrolled: true,
        attended: true,
        capacity: true,
      },
    });

    // Build attendance lookup: serviceId-date-sessionType -> record
    const attMap = new Map<string, typeof attendance[number]>();
    for (const a of attendance) {
      const key = `${a.serviceId}-${a.date.toISOString().split("T")[0]}-${a.sessionType}`;
      attMap.set(key, a);
    }

    // Group shifts by service + date + session type
    const grouped: Record<
      string,
      {
        serviceId: string;
        serviceName: string;
        serviceCode: string;
        state: string | null;
        date: string;
        sessionType: string;
        shifts: Array<{
          id: string;
          staffName: string;
          shiftStart: string;
          shiftEnd: string;
          role: string | null;
        }>;
        staffCount: number;
        enrolled: number;
        attended: number;
        capacity: number;
        requiredStaff: number; // 1:15 ratio
        variance: number;
        isVic: boolean;
      }
    > = {};

    for (const s of shifts) {
      const dateStr = s.date.toISOString().split("T")[0];
      const key = `${s.serviceId}-${dateStr}-${s.sessionType}`;

      if (!grouped[key]) {
        const att = attMap.get(key);
        const enrolled = att?.enrolled || 0;
        const requiredStaff = Math.ceil(enrolled / 15);

        grouped[key] = {
          serviceId: s.serviceId,
          serviceName: s.service.name,
          serviceCode: s.service.code,
          state: s.service.state,
          date: dateStr,
          sessionType: s.sessionType,
          shifts: [],
          staffCount: 0,
          enrolled,
          attended: att?.attended || 0,
          capacity: att?.capacity || 0,
          requiredStaff,
          variance: 0,
          isVic: s.service.state === "VIC",
        };
      }

      grouped[key].shifts.push({
        id: s.id,
        staffName: s.staffName,
        shiftStart: s.shiftStart,
        shiftEnd: s.shiftEnd,
        role: s.role,
      });
      grouped[key].staffCount++;
    }

    // Calculate variance for each group
    const sessions = Object.values(grouped).map((g) => {
      g.variance = g.staffCount - g.requiredStaff;
      return g;
    });

    // VIC qualification check for VIC services
    const vicSessions = sessions.filter((s) => s.isVic);
    const qualRisks: Array<{
      serviceId: string;
      serviceName: string;
      date: string;
      sessionType: string;
      diplomaCount: number;
      totalRostered: number;
      diplomaPercent: number;
      belowThreshold: boolean;
    }> = [];

    if (vicSessions.length > 0) {
      // Get all staff names from VIC sessions
      const vicStaffNames = [
        ...new Set(vicSessions.flatMap((s) => s.shifts.map((sh) => sh.staffName))),
      ];

      // Match to users and check qualifications
      const users = await prisma.user.findMany({
        where: { name: { in: vicStaffNames }, active: true },
        select: {
          name: true,
          qualifications: {
            where: { type: { in: ["diploma", "bachelor", "masters"] } },
            select: { type: true },
          },
        },
      });

      const diplomaStaff = new Set(
        users.filter((u) => u.qualifications.length > 0).map((u) => u.name),
      );

      for (const session of vicSessions) {
        const total = session.shifts.length;
        const diplomaCount = session.shifts.filter((s) =>
          diplomaStaff.has(s.staffName),
        ).length;
        const diplomaPercent =
          total > 0 ? Math.round((diplomaCount / total) * 100) : 0;

        if (diplomaPercent < 50) {
          qualRisks.push({
            serviceId: session.serviceId,
            serviceName: session.serviceName,
            date: session.date,
            sessionType: session.sessionType,
            diplomaCount,
            totalRostered: total,
            diplomaPercent,
            belowThreshold: true,
          });
        }
      }
    }

    const res = NextResponse.json({
      sessions,
      count: sessions.length,
      totalShifts: shifts.length,
      qualificationRisks: qualRisks.length > 0 ? qualRisks : undefined,
    });
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res;
  } catch (err) {
    console.error("[Cowork HR Roster GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch roster data" },
      { status: 500 },
    );
  }
}
