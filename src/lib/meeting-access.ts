import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { EOS_ROLES } from "@/lib/role-enum";

export const MEETING_READ_ROLES = [...ADMIN_ROLES, ...EOS_ROLES, "marketing", "member"] as const;

/** Scope applies to transcripts and derived actions as well as meeting pages. */
export async function assertMeetingAccess(session: Session, meetingId: string) {
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { active: true, role: true, serviceId: true, isCentreAccount: true } });
  if (!user?.active || !(MEETING_READ_ROLES as readonly string[]).includes(user.role)) throw ApiError.forbidden();
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: {
    id: true, createdById: true, serviceIds: true, isLeadership: true,
    attendees: { where: { userId: session.user.id }, select: { userId: true } },
  } });
  if (!meeting) throw ApiError.notFound("Meeting not found");
  const liveSession = { ...session, user: { ...session.user, ...user } };
  const { serviceIds } = await getCentreScope(liveSession);
  if (serviceIds === null || meeting.createdById === session.user.id || meeting.attendees.length > 0) return;
  // A mixed-centre meeting exposes every centre discussed, so require all.
  if (!meeting.isLeadership && meeting.serviceIds.length > 0 && meeting.serviceIds.every(id => serviceIds.includes(id))) return;
  throw ApiError.notFound("Meeting not found");
}
