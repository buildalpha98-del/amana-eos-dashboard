import { addDaysUTC, serviceDateOnly } from "@/lib/timezone";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { createServiceStaffSchema } from "@/lib/schemas/service-staff";
import { deriveMembershipDefaults } from "@/lib/derive-membership-defaults";
import { assertServiceAccess } from "@/lib/authz-scope";
import { ADMIN_ROLES, isAdminRole } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";

const ORG_WIDE_ROLES = new Set<Role>(ADMIN_ROLES);

function canMutate(role: Role, userServiceId: string | null | undefined, serviceId: string) {
  if (ORG_WIDE_ROLES.has(role)) return true;
  if (role === "member" && userServiceId === serviceId) return true;
  return false;
}

function toIsoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return new Date(d).toISOString().slice(0, 10);
}

// GET /api/services/[id]/staff
export const GET = withApiAuth(async (req, session, context) => {
  const { id: serviceId } = await context!.params!;

  // SECURITY (2026-09-04, staff-portal-v2 Chunk 5): read access was
  // previously open to EVERY authenticated role for EVERY service — any
  // educator could enumerate another centre's staff list including emails.
  // Same fail-closed model as the staff-certificates route / authz-scope:
  // admin roles are org-wide, everyone else only their own primary service.
  assertServiceAccess(session, serviceId);
  // Emails go to whoever RUNS this centre — the office, or the centre's own
  // account (2026-10-09: Manage staff). Educators get `email: null`; the
  // roster grid and shift modal only need id/name/avatar.
  const runsCentre =
    isAdminRole(session.user.role) ||
    (session.user.role === "member" && session.user.serviceId === serviceId);
  const includeEmail = runsCentre;
  // Manage staff asks for the extra columns: PIN set (never the PIN),
  // induction, certificates.
  const withDetail = runsCentre && new URL(req.url).searchParams.get("detail") === "1";
  // The Staff tab lists EVERYONE assigned here (primary or membership) —
  // including the centre's shared mailbox login — so what you see matches
  // what the add dialog's "already primary" check sees. Roster pickers
  // don't pass this flag: a mailbox isn't an educator to roster or count.
  const includeCentreAccounts =
    new URL(req.url).searchParams.get("centreAccounts") === "1";
  const accountFilter = includeCentreAccounts ? {} : { isCentreAccount: false };

  const [primaryUsers, memberships] = await Promise.all([
    prisma.user.findMany({
      // People only — the centre's shared mailbox isn't an educator to
      // roster or count (src/lib/centre-account.ts).
      where: { serviceId, active: true, ...accountFilter },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
        active: true,
        isCentreAccount: true,
        createdAt: true,
        kioskPinHash: true,
        inductionStatus: true,
        startDate: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.userServiceMembership.findMany({
      where: { serviceId, status: "active", user: accountFilter },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
            active: true,
            isCentreAccount: true,
            kioskPinHash: true,
            inductionStatus: true,
            startDate: true,
          },
        },
      },
      orderBy: { startDate: "asc" },
    }),
  ]);

  // Certificates per person (Manage staff only): expired / due in 30 days.
  const certsByUser = new Map<string, { expired: number; expiring: number }>();
  if (withDetail) {
    const ids = [...primaryUsers.map((u) => u.id), ...memberships.map((m) => m.user.id)];
    const today = serviceDateOnly();
    const in30 = addDaysUTC(today, 30);
    const certs = await prisma.complianceCertificate.findMany({
      where: { userId: { in: ids }, expiryDate: { not: null, lte: in30 } },
      select: { userId: true, expiryDate: true },
    });
    for (const c of certs) {
      if (!c.userId) continue;
      const row = certsByUser.get(c.userId) ?? { expired: 0, expiring: 0 };
      if (c.expiryDate! < today) row.expired += 1;
      else row.expiring += 1;
      certsByUser.set(c.userId, row);
    }
  }
  const detailOf = (u: { id: string; kioskPinHash: string | null; inductionStatus: string; startDate: Date | null }) =>
    withDetail
      ? {
          detail: {
            pinSet: Boolean(u.kioskPinHash),
            inductionStatus: u.inductionStatus,
            startDate: toIsoDate(u.startDate),
            certs: certsByUser.get(u.id) ?? { expired: 0, expiring: 0 },
          },
        }
      : {};

  const members = [
    ...primaryUsers.map((u) => {
      const d = deriveMembershipDefaults(u);
      return {
        userId: u.id,
        name: u.name,
        email: includeEmail ? u.email : null,
        avatar: u.avatar,
        role: u.role,
        isPrimary: true,
        isActive: u.active,
        isCentreAccount: u.isCentreAccount ?? false,
        ...detailOf(u),
        membership: {
          // Synthetic id for primary rows so the client can route a
          // remove call to the [membershipId] handler. The handler
          // detects the prefix and clears User.serviceId rather than
          // deleting a UserServiceMembership row.
          id: `primary:${u.id}` as string | null,
          roleAtService: d.roleAtService,
          accessLevel: d.accessLevel,
          startDate: d.startDate,
          endDate: d.endDate,
          status: d.status,
        },
      };
    }),
    ...memberships.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: includeEmail ? m.user.email : null,
      avatar: m.user.avatar,
      role: m.user.role,
      isPrimary: false,
      isActive: m.user.active,
      isCentreAccount: m.user.isCentreAccount ?? false,
      ...detailOf(m.user),
      membership: {
        id: m.id,
        roleAtService: m.roleAtService,
        accessLevel: m.accessLevel,
        startDate: toIsoDate(m.startDate)!,
        endDate: toIsoDate(m.endDate),
        status: m.status,
      },
    })),
  ];

  return NextResponse.json({ members });
});

// POST /api/services/[id]/staff
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id: serviceId } = await context!.params!;
    const role = session.user.role as Role;

    if (!canMutate(role, session.user.serviceId, serviceId)) {
      throw ApiError.forbidden("You cannot manage staff at this service");
    }

    const body = await parseJsonBody(req);
    const parsed = createServiceStaffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const data = parsed.data;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true },
    });
    if (!service) throw ApiError.notFound("Service not found");

    const targetUser = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, serviceId: true, active: true },
    });
    if (!targetUser || !targetUser.active) {
      throw ApiError.notFound("User not found");
    }
    if (targetUser.serviceId === serviceId) {
      throw ApiError.conflict("User is already primary at this service");
    }

    const existing = await prisma.userServiceMembership.findUnique({
      where: {
        userId_serviceId: { userId: data.userId, serviceId },
      },
    });

    if (existing && existing.status === "active") {
      throw ApiError.conflict("User is already a member of this service");
    }

    if (existing && existing.status === "inactive") {
      const reactivated = await prisma.userServiceMembership.update({
        where: { id: existing.id },
        data: {
          roleAtService: data.roleAtService,
          accessLevel: data.accessLevel,
          startDate: data.startDate,
          endDate: null,
          status: "active",
        },
      });
      return NextResponse.json(
        { ...reactivated, reactivated: true },
        { status: 200 },
      );
    }

    try {
      const created = await prisma.userServiceMembership.create({
        data: {
          userId: data.userId,
          serviceId,
          roleAtService: data.roleAtService,
          accessLevel: data.accessLevel,
          startDate: data.startDate,
        },
      });
      return NextResponse.json(created, { status: 201 });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "P2002") {
        throw ApiError.conflict("User is already a member of this service");
      }
      throw err;
    }
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
