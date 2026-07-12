import { NextResponse } from "next/server";
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

  const where: Record<string, unknown> = {};

  // Every non-admin is locked to their OWN requests (previously only `staff`
  // was — member/marketing/eos could omit ?userId= and dump everyone's leave
  // PII). Admins see all, optionally narrowed by ?userId=.
  const isAdmin = isAdminRole(session.user.role);
  if (!isAdmin) {
    where.userId = session.user.id;
  } else if (userId) {
    where.userId = userId;
  }

  if (status) where.status = status;
  // serviceId is an admin-only centre narrowing filter. Non-admins are
  // already locked to their own userId above; applying a serviceId filter to
  // them would wrongly hide their own leave with a null serviceId (the cowork
  // sync leaves it null when no serviceCode is provided).
  const scopedServiceId = resolveServiceIdFilter(session, serviceId);
  if (isAdmin && scopedServiceId) where.serviceId = scopedServiceId;
  if (leaveType) where.leaveType = leaveType;

  if (startAfter || startBefore) {
    where.startDate = {};
    if (startAfter) (where.startDate as Record<string, unknown>).gte = new Date(startAfter);
    if (startBefore) (where.startDate as Record<string, unknown>).lte = new Date(startBefore);
  }

  const requests = await prisma.leaveRequest.findMany({
    where: where as any,
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
