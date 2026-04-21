import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { z } from "zod";

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

const createShiftSchema = z.object({
  serviceId: z.string().min(1),
  userId: z.string().min(1),
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
    if (role !== "coordinator" || session.user.serviceId !== data.serviceId) {
      throw ApiError.forbidden();
    }
  }
  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { name: true },
  });
  if (!user) throw ApiError.notFound("User not found");
  const shift = await prisma.rosterShift.create({
    data: {
      serviceId: data.serviceId,
      userId: data.userId,
      staffName: user.name,
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
