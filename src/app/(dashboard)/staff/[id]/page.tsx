import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/role-permissions";
import { logger } from "@/lib/logger";
import { notFound, redirect } from "next/navigation";
import {
  StaffProfileTabs,
  type StaffProfileTabKey,
  type StaffProfileData,
} from "@/components/staff/StaffProfileTabs";
import { getCertStatus } from "@/lib/cert-status";

const VALID_TABS: ReadonlySet<StaffProfileTabKey> = new Set([
  "overview",
  "personal",
  "employment",
  "leave",
  "timesheet",
  "compliance",
  "documents",
  "contracts",
]);

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

function coerceTab(value: string | undefined): StaffProfileTabKey {
  if (value && VALID_TABS.has(value as StaffProfileTabKey)) {
    return value as StaffProfileTabKey;
  }
  return "overview";
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function StaffProfilePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const tab = coerceTab(sp.tab);

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

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
  const canEditEmployment = isAdmin;
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
      where: { uploadedById: id, deleted: false },
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

  return (
    <StaffProfileTabs
      data={data}
      activeTab={tab}
      canEditPersonal={canEditPersonal}
      canEditEmployment={canEditEmployment}
      canManageCompliance={canManageCompliance}
      isSelf={isSelf}
      isAdmin={isAdmin}
    />
  );
}
