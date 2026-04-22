import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

// GET /api/children/[id]/attendances?from=YYYY-MM-DD&to=YYYY-MM-DD
// Read-only historical attendance view. Returns records + aggregated stats.
// Non-admin roles are narrowed to their own serviceId.
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!from || !dateRegex.test(from)) {
    throw ApiError.badRequest("from (YYYY-MM-DD) required");
  }
  if (!to || !dateRegex.test(to)) {
    throw ApiError.badRequest("to (YYYY-MM-DD) required");
  }

  // Access: admin any; non-admin must match session.user.serviceId to child.serviceId
  const child = await prisma.child.findUnique({
    where: { id },
    select: { id: true, serviceId: true },
  });
  if (!child) throw ApiError.notFound();

  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    const viewerServiceId = session.user.serviceId ?? null;
    if (viewerServiceId !== child.serviceId) throw ApiError.forbidden();
  }

  // UTC-safe range — parse each piece as a number and build UTC midnights.
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  end.setUTCDate(end.getUTCDate() + 1); // inclusive end-of-day

  const rangeDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (rangeDays > 366) {
    throw ApiError.badRequest("Date range must not exceed 366 days");
  }

  const records = await prisma.attendanceRecord.findMany({
    where: { childId: id, date: { gte: start, lt: end } },
    orderBy: { date: "desc" },
    include: {
      signedInBy: { select: { id: true, name: true } },
      signedOutBy: { select: { id: true, name: true } },
    },
  });

  // Fees come from Booking on same (childId, date, sessionType) — fetch all
  // bookings for this child in the range and build a lookup map in JS.
  const bookings = await prisma.booking.findMany({
    where: {
      childId: id,
      date: { gte: start, lt: end },
      status: { in: ["confirmed", "requested"] },
    },
    select: { date: true, sessionType: true, fee: true },
  });

  const feeMap = new Map<string, number>();
  for (const b of bookings) {
    const isoDate = b.date.toISOString().split("T")[0];
    feeMap.set(`${isoDate}|${b.sessionType}`, b.fee ?? 0);
  }

  const shaped = records.map((r) => {
    const isoDate = r.date.toISOString().split("T")[0];
    const key = `${isoDate}|${r.sessionType}`;
    const fee = feeMap.has(key) ? (feeMap.get(key) ?? 0) : null;
    return {
      id: r.id,
      date: isoDate,
      sessionType: r.sessionType,
      status: r.status,
      signInTime: r.signInTime?.toISOString() ?? null,
      signOutTime: r.signOutTime?.toISOString() ?? null,
      signedInBy: r.signedInBy,
      signedOutBy: r.signedOutBy,
      absenceReason: r.absenceReason,
      notes: r.notes,
      fee,
    };
  });

  const stats = {
    attendances: shaped.filter((r) => r.status === "present").length,
    absences: shaped.filter((r) => r.status === "absent").length,
    totalFee: shaped.reduce((s, r) => s + (r.fee ?? 0), 0),
    totalHours: shaped.reduce((s, r) => {
      if (!r.signInTime || !r.signOutTime) return s;
      const diff =
        (new Date(r.signOutTime).getTime() -
          new Date(r.signInTime).getTime()) /
        3_600_000;
      return s + (diff > 0 ? diff : 0);
    }, 0),
  };

  return NextResponse.json({ records: shaped, stats });
});
