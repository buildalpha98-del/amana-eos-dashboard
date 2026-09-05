import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { getApprovedEhLeave } from "@/lib/eh-leave-cache";
import { z } from "zod";

// ---------------------------------------------------------------------------
// GET /api/roster/overlays?userIds=a,b,c&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// One batched fetch for ALL roster-grid overlays (replaces the old
// /api/roster/leave route — staff-portal-v2 Task 10.2):
//
//   leave        — approved INTERNAL leave overlapping [from, to] for the
//                  given staff ("On leave" chips). Deliberately keyed on
//                  userIds — NEVER LeaveRequest.serviceId, which is nullable
//                  (the cowork sync leaves it null when no serviceCode is
//                  provided), so a serviceId filter would silently hide real
//                  approved leave.
//   availability — recurring weekly UNAVAILABLE days (StaffAvailability
//                  rows with available: false, self-set on /profile) for
//                  the "Unavailable" cell hint. Weekday-keyed, not
//                  date-range-keyed, so [from, to] doesn't constrain it.
//   ehLeave      — approved EMPLOYMENT HERO leave (Task 5.4 follow-up):
//                  staff apply for leave via EH (/my-leave), so internal
//                  LeaveRequest rows alone miss real upcoming leave. Served
//                  from the 5-min in-process cache in eh-leave-cache.ts,
//                  then filtered to the same allow-listed userIds as the
//                  internal-leave query (member centre-scoping applies
//                  identically) and to the [from, to] window. Degrades to
//                  [] when EH is unconfigured or down — never breaks.
// ---------------------------------------------------------------------------

const querySchema = z.object({
  userIds: z
    .string()
    .min(1)
    .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(z.string().min(1)).min(1).max(200)),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const EMPTY = { leave: [], availability: [], ehLeave: [] };

export const GET = withApiAuth(
  async (req, session) => {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      userIds: searchParams.get("userIds") ?? "",
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
    });
    if (!parsed.success) {
      throw ApiError.badRequest(
        "userIds (csv, max 200), from and to (YYYY-MM-DD) are required",
        parsed.error.flatten(),
      );
    }
    const { userIds, from, to } = parsed.data;

    // Scope: admin roles may query any staff. A member (Director of Service)
    // is intersected against their OWN centre's staff — users whose primary
    // serviceId is the member's centre OR who hold an active
    // UserServiceMembership there — before the overlay queries run, so they
    // can never read another centre's leave/availability by guessing userIds.
    let allowedIds = userIds;
    if (!isAdminRole(session.user.role)) {
      const centreId =
        (session.user as { serviceId?: string | null }).serviceId ?? null;
      if (!centreId) {
        return NextResponse.json(EMPTY);
      }
      const centreStaff = await prisma.user.findMany({
        where: {
          id: { in: userIds },
          OR: [
            { serviceId: centreId },
            {
              serviceMemberships: {
                some: { serviceId: centreId, status: "active" },
              },
            },
          ],
        },
        select: { id: true },
      });
      allowedIds = centreStaff.map((u) => u.id);
      if (allowedIds.length === 0) {
        return NextResponse.json(EMPTY);
      }
    }

    const [leave, availability, ehLeaveAll] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: {
          userId: { in: allowedIds },
          status: "leave_approved",
          // Overlap: startDate <= to AND endDate >= from.
          startDate: { lte: new Date(to) },
          endDate: { gte: new Date(from) },
        },
        select: {
          userId: true,
          leaveType: true,
          startDate: true,
          endDate: true,
          isHalfDay: true,
        },
        orderBy: { startDate: "asc" },
      }),
      // Only the unavailable rows — the hint has nothing to render for
      // available days, so don't ship them.
      prisma.staffAvailability.findMany({
        where: {
          userId: { in: allowedIds },
          available: false,
        },
        select: { userId: true, weekday: true, note: true },
        orderBy: { weekday: "asc" },
      }),
      // Org-wide approved EH leave from the 5-min cache — scoped below.
      getApprovedEhLeave(),
    ]);

    // Same allow-list as the internal-leave query (member centre-scoping
    // already applied), then inclusive date-range overlap against the
    // window. EH dates are ISO datetimes — compare the YYYY-MM-DD prefixes
    // lexicographically; never Date-parse (a UTC parse can shift the day).
    const allowedSet = new Set(allowedIds);
    const ehLeave = ehLeaveAll.filter((entry) => {
      if (!allowedSet.has(entry.userId)) return false;
      const entryFrom = entry.fromDate.slice(0, 10);
      const entryTo = entry.toDate.slice(0, 10);
      return entryFrom <= to && entryTo >= from;
    });

    return NextResponse.json({ leave, availability, ehLeave });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
