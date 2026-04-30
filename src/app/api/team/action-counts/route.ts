import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/role-permissions";

function startOfIsoWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * GET /api/team/action-counts
 *
 * Returns counts of items requiring staff action for the Action Required
 * widget on the /team page:
 *   - certsExpiring: compliance certificates expiring within 30 days
 *   - leavePending: leave requests awaiting approval
 *   - timesheetsPending: timesheets submitted and awaiting review
 *
 * Scoping:
 *   - Admin/owner/head_office: org-wide counts
 *   - Coordinator: scoped to their own User.serviceId (if set)
 *   - Other roles: scoped to their own serviceId (the widget hides itself
 *     client-side for staff/member/marketing, but the endpoint still
 *     returns scoped counts in case it's called directly)
 */
export const GET = withApiAuth(async (_req, session) => {
  const role = session.user.role ?? "";
  const isAdmin = isAdminRole(role);
  const scopedServiceId = !isAdmin ? session.user.serviceId ?? null : null;

  const now = new Date();
  const in30days = new Date();
  in30days.setDate(in30days.getDate() + 30);

  const [certsExpiring, leavePending, timesheetsPending, shiftSwapsPending, pulsesConcerning] =
    await Promise.all([
      prisma.complianceCertificate.count({
        where: {
          expiryDate: { gte: now, lte: in30days },
          ...(scopedServiceId ? { serviceId: scopedServiceId } : {}),
        },
      }),
      prisma.leaveRequest.count({
        where: {
          status: "leave_pending",
          ...(scopedServiceId
            ? { user: { serviceId: scopedServiceId } }
            : {}),
        },
      }),
      prisma.timesheet.count({
        where: {
          // TimesheetStatus enum value is "submitted" (not "ts_submitted")
          status: "submitted",
          ...(scopedServiceId ? { serviceId: scopedServiceId } : {}),
        },
      }),
      prisma.shiftSwapRequest.count({
        where: {
          status: "accepted",
          ...(scopedServiceId
            ? { shift: { serviceId: scopedServiceId } }
            : {}),
        },
      }),
      prisma.weeklyPulse.count({
        where: {
          submittedAt: { not: null },
          mood: { lte: 2 },
          weekOf: { gte: startOfIsoWeek() },
          ...(scopedServiceId
            ? { user: { serviceId: scopedServiceId } }
            : {}),
        },
      }),
    ]);

  return NextResponse.json({
    certsExpiring,
    leavePending,
    timesheetsPending,
    shiftSwapsPending,
    pulsesConcerning,
  });
});
