import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { z } from "zod";

// ---------------------------------------------------------------------------
// GET /api/roster/leave?userIds=a,b,c&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Approved INTERNAL leave overlapping [from, to] for the given staff, so the
// roster grid can overlay "On leave" chips. Deliberately keyed on userIds —
// NEVER LeaveRequest.serviceId, which is nullable (the cowork sync leaves it
// null when no serviceCode is provided), so a serviceId filter would silently
// hide real approved leave.
//
// NOTE: staff apply for leave via Employment Hero (/my-leave); this endpoint
// only sees the internal LeaveRequest table. The grid surfaces that
// limitation in its legend copy (plan Task 5.4).
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
    // UserServiceMembership there — before the leave query runs, so they can
    // never read another centre's leave by guessing userIds.
    let allowedIds = userIds;
    if (!isAdminRole(session.user.role)) {
      const centreId =
        (session.user as { serviceId?: string | null }).serviceId ?? null;
      if (!centreId) {
        return NextResponse.json({ leave: [] });
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
        return NextResponse.json({ leave: [] });
      }
    }

    const rows = await prisma.leaveRequest.findMany({
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
    });

    return NextResponse.json({ leave: rows });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
