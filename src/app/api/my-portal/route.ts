import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
export const GET = withApiAuth(async (req, session) => {
const userId = session!.user.id;

  // Run all queries in parallel for efficiency
  const [
    userProfile,
    leaveBalances,
    pendingLeaveRequests,
    activeContract,
    publishedPolicies,
    userPolicyAcks,
    onboardingAssignment,
    offboardingAssignment,
    lmsEnrollments,
    complianceCerts,
    recentActivity,
  ] = await Promise.all([
    // 1. Full profile with service, emergency contacts, qualifications
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        avatar: true,
        dateOfBirth: true,
        addressStreet: true,
        addressSuburb: true,
        addressState: true,
        addressPostcode: true,
        visaStatus: true,
        visaExpiry: true,
        employmentType: true,
        startDate: true,
        probationEndDate: true,
        superFundName: true,
        superMemberNumber: true,
        superUSI: true,
        bankDetailsNote: true,
        xeroEmployeeId: true,
        // NOTE: taxFileNumber deliberately excluded (sensitive)
        service: { select: { id: true, name: true, code: true } },
        emergencyContacts: {
          select: {
            id: true,
            name: true,
            phone: true,
            relationship: true,
            isPrimary: true,
          },
          orderBy: { isPrimary: "desc" },
        },
        qualifications: {
          select: {
            id: true,
            type: true,
            name: true,
            institution: true,
            completedDate: true,
            expiryDate: true,
            verified: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),

    // 2. Leave balances
    prisma.leaveBalance.findMany({
      where: { userId },
      select: {
        leaveType: true,
        balance: true,
        accrued: true,
        taken: true,
        pending: true,
      },
    }),

    // 3. Pending leave requests
    prisma.leaveRequest.findMany({
      where: { userId, status: "leave_pending" },
      select: {
        id: true,
        leaveType: true,
        startDate: true,
        endDate: true,
        totalDays: true,
        status: true,
        createdAt: true,
      },
      orderBy: { startDate: "asc" },
    }),

    // 4. Active contract (most recent active one)
    prisma.employmentContract.findFirst({
      where: { userId, status: "active" },
      select: {
        id: true,
        contractType: true,
        awardLevel: true,
        payRate: true,
        hoursPerWeek: true,
        startDate: true,
        endDate: true,
        status: true,
        acknowledgedByStaff: true,
      },
      orderBy: { startDate: "desc" },
    }),

    // 5. All published policies (to cross-reference with acks)
    prisma.policy.findMany({
      where: { status: "published", deleted: false },
      select: {
        id: true,
        title: true,
        category: true,
        version: true,
        publishedAt: true,
      },
    }),

    // 6. User's policy acknowledgements
    prisma.policyAcknowledgement.findMany({
      where: { userId },
      select: {
        policyId: true,
        policyVersion: true,
      },
    }),

    // 7. Onboarding progress (most recent active)
    prisma.staffOnboarding.findFirst({
      where: {
        userId,
        status: { in: ["not_started", "in_progress"] },
      },
      select: {
        id: true,
        status: true,
        pack: { select: { name: true } },
        progress: {
          select: { completed: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),

    // 8. Offboarding progress (most recent active)
    prisma.staffOffboarding.findFirst({
      where: {
        userId,
        status: { in: ["not_started", "in_progress"] },
      },
      select: {
        id: true,
        status: true,
        pack: { select: { name: true } },
        progress: {
          select: { completed: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),

    // 9. LMS enrollments with course + module progress counts
    prisma.lMSEnrollment.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        course: {
          select: {
            title: true,
            _count: { select: { modules: true } },
          },
        },
        moduleProgress: {
          select: { completed: true },
        },
      },
      orderBy: { enrolledAt: "desc" },
    }),

    // 10. Compliance certificates for this user
    prisma.complianceCertificate.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        label: true,
        expiryDate: true,
        acknowledged: true,
      },
      orderBy: { expiryDate: "asc" },
    }),

    // 11. Recent activity logs
    prisma.activityLog.findMany({
      where: { userId },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        details: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  // Build ack lookup: policyId -> max acknowledged version
  const ackMap = new Map<string, number>();
  for (const ack of userPolicyAcks) {
    const current = ackMap.get(ack.policyId) ?? 0;
    if (ack.policyVersion > current) {
      ackMap.set(ack.policyId, ack.policyVersion);
    }
  }

  // Pending policies: published but user hasn't acked at current version
  const pendingPolicies = publishedPolicies
    .filter((p) => {
      const ackedVersion = ackMap.get(p.id) ?? 0;
      return ackedVersion < p.version;
    })
    .map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      version: p.version,
      publishedAt: p.publishedAt,
    }));

  // Onboarding progress summary
  const onboardingProgress = onboardingAssignment
    ? {
        active: true,
        packName: onboardingAssignment.pack.name,
        totalTasks: onboardingAssignment.progress.length,
        completedTasks: onboardingAssignment.progress.filter((p) => p.completed).length,
        status: onboardingAssignment.status,
      }
    : { active: false };

  // Offboarding progress summary
  const offboardingProgress = offboardingAssignment
    ? {
        active: true,
        packName: offboardingAssignment.pack.name,
        totalTasks: offboardingAssignment.progress.length,
        completedTasks: offboardingAssignment.progress.filter((p) => p.completed).length,
        status: offboardingAssignment.status,
      }
    : { active: false };

  // LMS enrollments mapped to portal shape
  const lmsEnrollmentsMapped = lmsEnrollments.map((e) => ({
    id: e.id,
    courseName: e.course.title,
    status: e.status,
    progress:
      e.course._count.modules > 0
        ? Math.round(
            (e.moduleProgress.filter((mp) => mp.completed).length /
              e.course._count.modules) *
              100
          )
        : 0,
    totalModules: e.course._count.modules,
    completedModules: e.moduleProgress.filter((mp) => mp.completed).length,
  }));

  return NextResponse.json({
    profile: userProfile,
    leaveBalances,
    pendingLeaveRequests,
    activeContract: activeContract || null,
    pendingPolicies,
    onboardingProgress,
    offboardingProgress,
    lmsEnrollments: lmsEnrollmentsMapped,
    complianceCerts,
    recentActivity,
  });
});
