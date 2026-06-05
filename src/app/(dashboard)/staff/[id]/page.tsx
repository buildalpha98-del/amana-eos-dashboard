import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/role-permissions";
import { requirePageSession } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { notFound } from "next/navigation";
import type { StaffProfileData } from "@/components/staff/types";
import { StaffProfileLayout } from "@/components/staff/StaffProfileLayout";
import { getCertStatus } from "@/lib/cert-status";
import { computeSnapshotStats } from "@/lib/staff/snapshot-stats";
import { buildListWhere } from "@/lib/employees/build-list-where";
import { getCentreScope } from "@/lib/centre-scope";

export async function canAccessProfile(
  viewerId: string,
  viewerRole: string | null,
  target: { id: string; serviceId: string | null },
): Promise<boolean> {
  if (viewerId === target.id) return true;
  if (isAdminRole(viewerRole)) return true;
  if (viewerRole === "member") {
    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { serviceId: true },
    });
    return !!viewer?.serviceId && viewer.serviceId === target.serviceId;
  }
  return false;
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Build the /team back-link, preserving any list-state search params
 * (status, service, role, q, page, sort) that the EmployeeRow link
 * carried over when the user clicked through. Strips the legacy
 * `tab` param which has no meaning in the new long-scroll layout.
 */
function buildBackHref(
  sp: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key === "tab") continue;
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `/team?${qs}` : "/team";
}

/**
 * Build a /staff/[id] link to a sibling user, carrying the same
 * searchParams so the navigation context (filters, sort, page) is
 * preserved. The user can keep paging through the same filtered list.
 */
function buildSiblingHref(
  userId: string,
  sp: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key === "tab") continue;
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `/staff/${userId}?${qs}` : `/staff/${userId}`;
}

export default async function StaffProfilePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const backHref = buildBackHref(sp);

  const session = await requirePageSession();

  const targetUser = await prisma.user.findUnique({
    where: { id },
    include: { service: true },
  });
  if (!targetUser) notFound();

  const viewerRole = session.user.role ?? null;
  const allowed = await canAccessProfile(session.user.id, viewerRole, {
    id: targetUser.id,
    serviceId: targetUser.serviceId,
  });

  if (!allowed) {
    logger.warn("Staff profile access denied", {
      viewerId: session.user.id,
      viewerRole,
      targetId: id,
    });
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-lg font-semibold text-foreground">Access denied</h1>
          <p className="text-sm text-muted mt-2">
            You don&apos;t have permission to view this profile.
          </p>
        </div>
      </div>
    );
  }

  const isSelf = session.user.id === targetUser.id;
  const isAdmin = isAdminRole(viewerRole);
  const canEditPersonal = isSelf || isAdmin;
  const canEditEmployment = isSelf || isAdmin;
  const canManageCompliance = isAdmin;

  // 2026-06-04: compute prev/next employee in the same filtered list
  // the user arrived from. Cheap query — IDs only — so admins can
  // page through staff one-by-one without bouncing back to /team.
  // Marketing bypasses scope on the team list, mirroring /api/employees.
  // Wrapped in try/catch so a downstream scope-resolution issue can't
  // 500 the whole profile — we just hide the prev/next buttons.
  let prevHref: string | null = null;
  let nextHref: string | null = null;
  try {
    const scopedServiceIds: string[] | null =
      viewerRole === "marketing"
        ? null
        : (await getCentreScope(session)).serviceIds;
    const listParams = {
      q: typeof sp.q === "string" ? sp.q : undefined,
      status: typeof sp.status === "string" ? sp.status : undefined,
      s: typeof sp.s === "string" ? sp.s : undefined,
      r: typeof sp.r === "string" ? sp.r : undefined,
      tag: typeof sp.tag === "string" ? sp.tag : undefined,
    };
    const sortParam = typeof sp.sort === "string" ? sp.sort : "name";
    const orderBy = (() => {
      switch (sortParam) {
        case "role":
          return { role: "asc" as const };
        case "service":
          return { service: { name: "asc" as const } };
        case "status":
          return { active: "desc" as const };
        case "name":
        default:
          return { name: "asc" as const };
      }
    })();
    const siblingWhere = buildListWhere({
      params: listParams,
      scopedServiceIds,
      hideDeactivatedByDefault: true,
    });
    const siblings =
      scopedServiceIds !== null && scopedServiceIds.length === 0
        ? []
        : (await prisma.user.findMany({
            where: siblingWhere,
            orderBy,
            select: { id: true },
          })) ?? [];
    const currentIdx = siblings.findIndex((u) => u.id === targetUser.id);
    const prevId = currentIdx > 0 ? siblings[currentIdx - 1].id : null;
    const nextId =
      currentIdx >= 0 && currentIdx < siblings.length - 1
        ? siblings[currentIdx + 1].id
        : null;
    prevHref = prevId ? buildSiblingHref(prevId, sp) : null;
    nextHref = nextId ? buildSiblingHref(nextId, sp) : null;
  } catch (err) {
    logger.warn("Staff profile: prev/next sibling lookup failed", {
      viewerId: session.user.id,
      targetId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    // Leave prev/next as null — the buttons just render disabled.
  }

  // Fetch all profile data in parallel
  const [
    emergencyContacts,
    latestContract,
    balances,
    recentLeaveRequests,
    timesheetEntries,
    qualifications,
    certificates,
    documents,
    activeRocks,
    openTodos,
    nextShift,
  ] = await Promise.all([
    prisma.emergencyContact.findMany({
      where: { userId: id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    }),
    prisma.employmentContract.findFirst({
      where: { userId: id },
      orderBy: { startDate: "desc" },
    }),
    prisma.leaveBalance.findMany({ where: { userId: id } }),
    prisma.leaveRequest.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.timesheetEntry.findMany({
      where: { userId: id },
      include: { timesheet: { select: { weekEnding: true, status: true } } },
      orderBy: { timesheet: { weekEnding: "desc" } },
      take: 50,
    }),
    prisma.staffQualification.findMany({
      where: { userId: id },
      orderBy: { expiryDate: "asc" },
    }),
    prisma.complianceCertificate.findMany({
      where: { userId: id },
      orderBy: { expiryDate: "asc" },
    }),
    prisma.document.findMany({
      // Documents either uploaded BY this staff member, or uploaded
      // by an admin and explicitly assigned TO them (e.g. HR docs).
      where: {
        deleted: false,
        OR: [{ uploadedById: id }, { assignedToId: id }],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.rock.count({
      where: { ownerId: id, status: { notIn: ["complete", "dropped"] }, deleted: false },
    }).catch(() => 0),
    prisma.todo.count({
      where: {
        assigneeId: id,
        status: { notIn: ["complete", "cancelled"] },
        deleted: false,
      },
    }).catch(() => 0),
    prisma.rosterShift.findFirst({
      where: {
        userId: targetUser.id,
        status: "published",
        date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      orderBy: [{ date: "asc" }, { shiftStart: "asc" }],
      select: {
        id: true,
        date: true,
        shiftStart: true,
        shiftEnd: true,
        sessionType: true,
        role: true,
        staffName: true,
        userId: true,
        status: true,
      },
    }).catch(() => null),
  ]);

  // Aggregate timesheets by weekEnding (last 5 weeks)
  const weekBuckets = new Map<string, { weekEnding: Date; totalHours: number; status: string }>();
  for (const entry of timesheetEntries) {
    if (!entry.timesheet) continue;
    const key = new Date(entry.timesheet.weekEnding).toISOString().slice(0, 10);
    const existing = weekBuckets.get(key);
    const hours =
      typeof entry.totalHours === "number"
        ? entry.totalHours
        : Number(entry.totalHours ?? 0);
    if (existing) {
      existing.totalHours += hours;
    } else {
      weekBuckets.set(key, {
        weekEnding: new Date(entry.timesheet.weekEnding),
        totalHours: hours,
        status: entry.timesheet.status,
      });
    }
  }
  const timesheetWeeks = Array.from(weekBuckets.values())
    .sort((a, b) => b.weekEnding.getTime() - a.weekEnding.getTime())
    .slice(0, 5);

  // Derived stats
  const annualLeave = balances.find((b) => b.leaveType === "annual");
  const annualLeaveRemaining = annualLeave ? annualLeave.balance : null;
  const certStatuses = certificates.map((c) => getCertStatus(c.expiryDate));
  const validCertCount = certStatuses.filter((s) => s.status === "valid").length;
  const expiringCertCount = certStatuses.filter((s) => s.status === "expiring").length;

  const data: StaffProfileData = {
    targetUser,
    emergencyContacts,
    latestContract,
    balances,
    recentLeaveRequests,
    timesheetWeeks,
    qualifications,
    certificates,
    documents,
    nextShift,
    stats: {
      activeRocks: Number(activeRocks) || 0,
      openTodos: Number(openTodos) || 0,
      annualLeaveRemaining,
      validCertCount,
      expiringCertCount,
    },
  };

  // Compute the long-scroll layout's snapshot panel content. The
  // helper is pure — same input always yields the same output, no DB
  // calls. Parent passes `latestContract.startDate` as the earliest
  // contract start because the data load only fetches the most-recent
  // active contract; if that's older than User.createdAt, tenure
  // back-dates to it.
  const snapshotStats = computeSnapshotStats({
    user: { createdAt: targetUser.createdAt },
    earliestContractStart: latestContract?.startDate ?? null,
    nextShift: nextShift
      ? {
          date: new Date(nextShift.date),
          shiftStart: nextShift.shiftStart,
          shiftEnd: nextShift.shiftEnd,
          sessionType: nextShift.sessionType,
          service: targetUser.service
            ? { name: targetUser.service.name }
            : null,
        }
      : null,
    certificates: certificates.map((c) => ({ expiryDate: c.expiryDate })),
    activeRocks: Number(activeRocks) || 0,
    openTodos: Number(openTodos) || 0,
  });

  return (
    <StaffProfileLayout
      data={data}
      snapshotStats={snapshotStats}
      viewerRole={viewerRole ?? ""}
      isSelf={isSelf}
      isAdmin={isAdmin}
      canEditPersonal={canEditPersonal}
      canEditEmployment={canEditEmployment}
      canManageCompliance={canManageCompliance}
      backHref={backHref}
      prevHref={prevHref}
      nextHref={nextHref}
    />
  );
}
