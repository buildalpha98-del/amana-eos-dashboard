import { NextResponse } from "next/server";
import { LeaveRequestStatus, LeaveType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { isAdminRole } from "@/lib/role-permissions";
import { resolveServiceIdFilter } from "@/lib/authz-scope";

// GET /api/leave/requests — list leave requests
export const GET = withApiAuth(async (req, session) => {
const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const status = searchParams.get("status");
  const serviceId = searchParams.get("serviceId");
  const leaveType = searchParams.get("leaveType");
  const startAfter = searchParams.get("startAfter");
  const startBefore = searchParams.get("startBefore");

  const where: Prisma.LeaveRequestWhereInput = {};

  // Every non-admin is locked to their OWN requests (previously only `staff`
  // was — member/marketing/eos could omit ?userId= and dump everyone's leave
  // PII). Admins see all, optionally narrowed by ?userId=.
  const isAdmin = isAdminRole(session.user.role);
  if (!isAdmin) {
    where.userId = session.user.id;
  } else if (userId) {
    where.userId = userId;
  }

  // Coerce query-string enum filters; unknown values are ignored rather than
  // reaching Prisma's where clause (same convention as parseRoleParam).
  const statusFilter = Object.values(LeaveRequestStatus).find((s) => s === status);
  if (statusFilter) where.status = statusFilter;
  // serviceId is an admin-only centre narrowing filter. Non-admins are
  // already locked to their own userId above; applying a serviceId filter to
  // them would wrongly hide their own leave with a null serviceId (the cowork
  // sync leaves it null when no serviceCode is provided).
  const scopedServiceId = resolveServiceIdFilter(session, serviceId);
  if (isAdmin && scopedServiceId) where.serviceId = scopedServiceId;
  const leaveTypeFilter = Object.values(LeaveType).find((t) => t === leaveType);
  if (leaveTypeFilter) where.leaveType = leaveTypeFilter;

  if (startAfter || startBefore) {
    where.startDate = {
      ...(startAfter ? { gte: new Date(startAfter) } : {}),
      ...(startBefore ? { lte: new Date(startBefore) } : {}),
    };
  }

  const requests = await prisma.leaveRequest.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
      service: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
});

// POST /api/leave/requests — RETIRED 2026-06-29.
// New leave requests go through My Portal → EH so managers get the
// pending notification inside Employment Hero. This endpoint remains
// wired only to return a helpful 410 with a redirect pointer for any
// stragglers still hitting it (bookmarked bots, tests, etc.). Delete
// entirely once we're sure nothing is calling it.
export const POST = withApiAuth(async () => {
  return NextResponse.json(
    {
      error:
        "This endpoint is retired. Submit new leave via My Portal → Leave — requests now land in Employment Hero directly.",
      redirectTo: "/my-portal#leave",
    },
    { status: 410 },
  );
});
