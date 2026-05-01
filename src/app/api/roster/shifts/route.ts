import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { z } from "zod";
import { assertStaffCertsValidForShift } from "../_lib/cert-guard";

// ---------------------------------------------------------------------------
// GET /api/roster/shifts?serviceId=...&weekStart=YYYY-MM-DD
// Returns all shifts for the 7-day window starting at weekStart.
// ---------------------------------------------------------------------------

export const GET = withApiAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const weekStart = searchParams.get("weekStart");
  if (!serviceId || !weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    throw ApiError.badRequest("serviceId and weekStart (YYYY-MM-DD) required");
  }
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const shifts = await prisma.rosterShift.findMany({
    where: { serviceId, date: { gte: start, lt: end } },
    orderBy: [{ date: "asc" }, { shiftStart: "asc" }],
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });
  return NextResponse.json({ shifts });
});

// ---------------------------------------------------------------------------
// POST /api/roster/shifts
// Create a shift. Admins: global. Coordinators: own service only.
// ---------------------------------------------------------------------------

// 2026-05-02: `userId` is now optional. Admin can create a shift without
// an assignee — that's an "open shift" any qualified staff can claim via
// POST /api/roster/shifts/[id]/claim. staffName is conditionally hydrated
// so the row stays internally consistent.
const createShiftSchema = z.object({
  serviceId: z.string().min(1),
  userId: z.string().min(1).nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  shiftStart: z.string().regex(/^\d{2}:\d{2}$/),
  shiftEnd: z.string().regex(/^\d{2}:\d{2}$/),
  role: z.string().nullish(),
  status: z.enum(["draft", "published"]).default("draft"),
});

export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = createShiftSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }
  const data = parsed.data;
  if (data.shiftStart >= data.shiftEnd) {
    throw ApiError.badRequest("shiftEnd must be later than shiftStart");
  }
  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    if (role !== "member" || session.user.serviceId !== data.serviceId) {
      throw ApiError.forbidden();
    }
  }
  // Hydrate staffName + run cert-expiry guard only when a user is
  // assigned. Open shifts (no assignee) skip both: staffName falls
  // back to the literal "Open shift" so existing grid renderers still
  // produce a recognisable cell, and the cert check is deferred to
  // POST /api/roster/shifts/[id]/claim — which is when an actual user
  // attaches to the shift.
  let staffName = "Open shift";
  if (data.userId) {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { name: true },
    });
    if (!user) throw ApiError.notFound("User not found");
    staffName = user.name;
    // 2026-05-02 (PR #52): block assignment when the user has any
    // expired blocking certificate (WWCC / first aid / food safety) by
    // the shift date.
    await assertStaffCertsValidForShift({
      userId: data.userId,
      shiftDate: new Date(data.date),
    });
  }

  const shift = await prisma.rosterShift.create({
    data: {
      serviceId: data.serviceId,
      userId: data.userId ?? null,
      staffName,
      date: new Date(data.date),
      sessionType: data.sessionType,
      shiftStart: data.shiftStart,
      shiftEnd: data.shiftEnd,
      role: data.role ?? null,
      status: data.status,
      createdById: session.user.id,
    },
  });
  return NextResponse.json({ shift }, { status: 201 });
});
