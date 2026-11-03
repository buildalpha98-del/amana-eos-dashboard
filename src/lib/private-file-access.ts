import { canReadParentMessages } from "@/lib/messaging-roles";
import type { Session } from "next-auth";
import type { PrivateFile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import { assertMeetingAccess } from "@/lib/meeting-access";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import type { ParentJwtPayload } from "@/lib/parent-auth";
import { privateFileUrl } from "@/lib/private-storage";

export async function assertPrivateFileAccess(file: PrivateFile, staff: Session | null, parent: ParentJwtPayload | null) {
  if (staff) {
    const user = await prisma.user.findUnique({ where: { id: staff.user.id }, select: { active: true, role: true, serviceId: true, isCentreAccount: true } });
    if (!user?.active) throw ApiError.forbidden();
    const session = { ...staff, user: { ...staff.user, ...user } };
    // Meeting scope takes precedence over uploader ownership.
    if (file.meetingId) return assertMeetingAccess(session, file.meetingId);
    // Child/family scope also takes precedence over who uploaded the file.
    if (!file.childId && !file.ownerParentId && file.ownerUserId === staff.user.id && !user.isCentreAccount) return;
    const isOffice = (ADMIN_ROLES as readonly string[]).includes(user.role);

    const { serviceIds } = await getCentreScope(session);
    if (isOffice && serviceIds === null) return;
    if (file.ownerParentId && canReadParentMessages(user.role)) {
      const family = await prisma.parentAccount.findUnique({ where: { id: file.ownerParentId }, select: { email: true } });
      if (family) {
        const message = await prisma.message.findFirst({ where: {
          attachmentUrls: { has: privateFileUrl(file.id) },
          conversation: { ...(serviceIds ? { serviceId: { in: serviceIds } } : {}), family: { email: { equals: family.email, mode: "insensitive" } } },
        }, select: { id: true } });
        if (message) return;
      }
    }
    if (![...ADMIN_ROLES, "member", "staff"].includes(user.role)) throw ApiError.forbidden();
    if (file.childId) {
      const child = await prisma.child.findUnique({ where: { id: file.childId }, select: { serviceId: true } });
      if (child?.serviceId && serviceIds?.includes(child.serviceId)) return;
    }
    // An enrolment upload becomes readable to its assigned centre only after
    // submission. Draft files are private to the family and owner/admin.
    if (file.ownerParentId) {
      const account = await prisma.parentAccount.findUnique({ where: { id: file.ownerParentId }, select: { email: true } });
      if (!account) throw ApiError.notFound("File not found");
      const url = privateFileUrl(file.id);
      const submission = await prisma.enrolmentSubmission.findFirst({ where: {
        serviceId: { in: serviceIds ?? [] }, status: { not: "draft" },
        AND: [
          { OR: ["primaryParent", "secondaryParent"].map(field => ({ [field]: { path: ["email"], equals: account.email } })) },
          { OR: ["documentUploads", "medicalFiles", "courtOrderFiles"].map(field => ({ [field]: { array_contains: [{ url }] } })) },
        ],
      }, select: { id: true } });
      if (submission) return;
      const absence = await prisma.absence.findFirst({ where: {
        serviceId: { in: serviceIds ?? [] }, medicalCertificateUrl: url,
        child: { enrolment: { OR: [
          { primaryParent: { path: ["email"], equals: account.email } },
          { secondaryParent: { path: ["email"], equals: account.email } },
        ] } },
      }, select: { id: true } });
      if (absence) return;
    }
  } else if (parent) {
    if (file.ownerParentId && file.ownerParentId === parent.accountId) return;
    if (file.childId) {
      const child = await prisma.child.findUnique({ where: { id: file.childId }, select: { enrolmentId: true } });
      if (child?.enrolmentId) {
        const sub = await prisma.enrolmentSubmission.findUnique({ where: { id: child.enrolmentId }, select: { primaryParent: true, secondaryParent: true } });
        const own = [sub?.primaryParent, sub?.secondaryParent].some(value => value && typeof value === "object" && !Array.isArray(value) && typeof value.email === "string" && value.email.toLowerCase().trim() === parent.email.toLowerCase().trim());
        if (own) return;
      }
    }
  }
  throw ApiError.notFound("File not found");
}
