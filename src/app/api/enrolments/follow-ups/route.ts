/**
 * GET /api/enrolments/follow-ups — Enrolments → Follow-ups panel
 * (src/lib/enrolment-follow-ups.ts). Admin tier sees every centre; a
 * coordinator (member) only their own.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES, isAdminRole } from "@/lib/role-permissions";
import { getFollowUps } from "@/lib/enrolment-follow-ups";

export const GET = withApiAuth(
  async (_req, session) => {
    const own = (session.user as { serviceId?: string | null }).serviceId ?? null;
    const serviceIds = isAdminRole(session.user.role) ? null : own ? [own] : [];
    return NextResponse.json(await getFollowUps(serviceIds));
  },
  { roles: [...ADMIN_ROLES, "member"] },
);
