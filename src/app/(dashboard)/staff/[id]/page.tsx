import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/role-permissions";
import { requirePageSession } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { notFound } from "next/navigation";
import type { StaffProfileData } from "@/components/staff/types";
import { StaffProfileLayout } from "@/components/staff/StaffProfileLayout";
import { getCertStatus } from "@/lib/cert-status";
import { computeSnapshotStats } from "@/lib/staff/snapshot-stats";

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
    />
  );
}
