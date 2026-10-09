/**
 * GET  /api/services/[id]/staff-inductions — the centre's view of its staff
 *      inductions (2026-10-09, Staff → Staff inductions): who's cleared, who
 *      isn't, and exactly what's still missing (from getInductionReadiness,
 *      the same blockers the person sees).
 * POST /api/services/[id]/staff-inductions { userId } — nudge one person
 *      with what's left.
 * The office or the centre's own account; never educators.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { getInductionReadiness } from "@/lib/induction";
import { notifyUsers } from "@/lib/notify-user";
import { assertManagesStaffMember } from "@/lib/centre-staff-access";

type Ctx = { params: Promise<{ id: string }> };

function assertRunsCentre(session: { user: { role?: string | null; serviceId?: string | null } }, serviceId: string) {
  const role = session.user.role ?? "";
  if (isAdminRole(role) || (role === "member" && session.user.serviceId === serviceId)) return;
  throw ApiError.forbidden("Only the centre's account or the office can see staff inductions.");
}

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as Ctx).params;
  assertRunsCentre(session, id);
  const people = await prisma.user.findMany({
    where: {
      active: true,
      isCentreAccount: false,
      role: { in: ["staff", "member"] },
      OR: [{ serviceId: id }, { serviceMemberships: { some: { serviceId: id, status: "active" } } }],
    },
    select: { id: true, name: true, avatar: true, inductionStatus: true, inductionDueDate: true, startDate: true },
    orderBy: { name: "asc" },
  });
  const rows = await Promise.all(
    people.map(async (p) => {
      const cleared = p.inductionStatus === "cleared";
      const blockers = cleared ? [] : (await getInductionReadiness(p.id)).blockers.map((b) => b.label);
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        status: p.inductionStatus,
        dueDate: p.inductionDueDate,
        startDate: p.startDate,
        missing: blockers,
      };
    }),
  );
  // Not-cleared first, most overdue first; cleared people alphabetically after.
  rows.sort((a, b) =>
    a.status === "cleared" || b.status === "cleared"
      ? Number(a.status === "cleared") - Number(b.status === "cleared") || a.name.localeCompare(b.name)
      : (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity),
  );
  return NextResponse.json({ rows });
});

const nudgeSchema = z.object({ userId: z.string().min(1) });

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as Ctx).params;
    assertRunsCentre(session, id);
    const parsed = nudgeSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("userId is required");
    await assertManagesStaffMember(session, parsed.data.userId);
    const { blockers } = await getInductionReadiness(parsed.data.userId);
    if (blockers.length === 0) return NextResponse.json({ sent: 0 });
    const sent = await notifyUsers(prisma, [parsed.data.userId], {
      type: "induction",
      title: "A few things left before you're cleared to work",
      body: blockers.map((b) => b.label).join(" · "),
      link: "/my-training",
    });
    return NextResponse.json({ sent });
  },
  { rateLimit: { max: 20, windowMs: 60_000 } },
);
