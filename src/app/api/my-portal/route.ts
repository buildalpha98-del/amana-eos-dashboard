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
    historicalContracts,
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
        acknowledgedAt: true,
        // templateId is consumed by the inline viewer modal: when present, the
        // client hits /api/contracts/[id]/render to re-render the HTML;
        // otherwise it falls back to embedding the baked PDF via documentUrl.
        templateId: true,
        // documentUrl is consumed by the frontend only to know whether to show
        // the "View Contract" button. The actual URL is never opened directly
        // by the client; it goes through /api/contracts/[id]/document which
        // re-enforces ownership server-side.
        documentUrl: true,
      },
      orderBy: { startDate: "desc" },
    }),

    // 4b. Past contracts (superseded or terminated) — read-only history so
    // staff can refer back to anything they previously signed.
    prisma.employmentContract.findMany({
      where: { userId, status: { in: ["superseded", "terminated"] } },
      select: {
        id: true,
        contractType: true,
        awardLevel: true,
        startDate: true,
        endDate: true,
        status: true,
        acknowledgedAt: true,
        documentUrl: true,
        templateId: true,
      },
      orderBy: { startDate: "desc" },
    }),

    // 5. Active policy documents with their current version
    prisma.policyDocument.findMany({
      where: { isArchived: false, currentVersionId: { not: null } },
      select: {
        id: true,
        title: true,
        category: true,
        currentVersion: {
          select: { id: true, versionNumber: true, uploadedAt: true },
        },
      },
    }),

    // 6. Versions the caller has acknowledged (only need version ids)
    prisma.policyDocumentAcknowledgement.findMany({
      where: { userId },
      select: { versionId: true },
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

  // Pending policies: current version exists and the caller has not acked it.
  const ackedVersionIds = new Set(userPolicyAcks.map((a) => a.versionId));
  const pendingPolicies = publishedPolicies
    .filter((p) => p.currentVersion && !ackedVersionIds.has(p.currentVersion.id))
    .map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      version: p.currentVersion!.versionNumber,
      publishedAt: p.currentVersion!.uploadedAt,
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
    historicalContracts,
    pendingPolicies,
    onboardingProgress,
    offboardingProgress,
    lmsEnrollments: lmsEnrollmentsMapped,
    complianceCerts,
    recentActivity,
  });
});
