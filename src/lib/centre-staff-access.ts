/**
 * May this signed-in account manage this staff member? (2026-10-09, the
 * centre's Manage staff page.) The office always can; otherwise only the
 * account that runs the person's centre — in practice the centre's own
 * login, since people who coordinate a centre sign in as ordinary staff
 * (Daniel). Never educators.
 */
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

export async function assertManagesStaffMember(session: Session, targetUserId: string): Promise<void> {
  const role = session.user.role ?? "";
  if (isAdminRole(role)) return;
  const myCentre = session.user.serviceId;
  if (role !== "member" || !myCentre) {
    throw ApiError.forbidden("Only the centre's account or the office can manage staff.");
  }
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      serviceId: true,
      role: true,
      serviceMemberships: { where: { serviceId: myCentre, status: "active" }, select: { id: true } },
    },
  });
  if (!target) throw ApiError.notFound("Staff member not found");
  // Staff only — a centre account can't manage the office or another centre's account.
  const atMyCentre = target.serviceId === myCentre || target.serviceMemberships.length > 0;
  if (!atMyCentre || !["staff", "member"].includes(target.role)) {
    throw ApiError.forbidden("That person isn't on your centre's staff.");
  }
}

/** The same weak-PIN rule staff get when they set their own. */
export const TRIVIAL_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321",
]);
