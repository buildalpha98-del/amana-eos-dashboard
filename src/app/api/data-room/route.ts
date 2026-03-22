import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DATA_ROOM_SECTIONS, TOTAL_WEIGHT, type DocumentStatus } from "@/lib/data-room-config";
import { withApiAuth } from "@/lib/server-auth";

/**
 * GET /api/data-room — returns DD sections with completeness scores
 * Restricted to owner / admin roles.
 */
export const GET = withApiAuth(async (req, session) => {
  // ── Run all queries in parallel ──────────────────────────────────────────
  const [
    documents,
    financialPeriods,
    complianceCerts,
    activeContractCount,
    contractsWithAward,
    qualificationCount,
    policies,
    centreMetrics,
    leads,
    menuWeekCount,
    attendanceCount,
    ownaServices,
  ] = await Promise.all([
    // 1. All non-deleted documents
    prisma.document.findMany({
      where: { deleted: false },
      select: { id: true, title: true, category: true, updatedAt: true },
    }),
    // 2. Financial periods
    prisma.financialPeriod.findMany({
      select: {
        id: true,
        periodType: true,
        periodStart: true,
        totalRevenue: true,
        budgetRevenue: true,
        xeroSyncedAt: true,
      },
    }),
    // 3. Compliance certificates
    prisma.complianceCertificate.findMany({
      select: { id: true, type: true, expiryDate: true },
    }),
    // 4. Active contracts count
    prisma.employmentContract.count({ where: { status: "active" } }),
    // 5. Active contracts with award levels
    prisma.employmentContract.findMany({
      where: { status: "active" },
      select: { awardLevel: true },
    }),
    // 6. Qualification records count
    prisma.staffQualification.count(),
    // 7. Published policies with ack counts
    prisma.policy.findMany({
      where: { deleted: false, status: "published" },
      select: { id: true, _count: { select: { acknowledgements: true } } },
    }),
    // 8. Latest centre metrics per service
    prisma.centreMetrics.findMany({
      orderBy: { recordedAt: "desc" },
      distinct: ["serviceId"],
      select: {
        serviceId: true,
        nqsRating: true,
        parentNps: true,
        incidentCount: true,
        educatorsTurnover: true,
        overallCompliance: true,
        recordedAt: true,
      },
    }),
    // 9. All leads (non-deleted)
    prisma.lead.findMany({
      where: { deleted: false },
      select: { id: true, source: true, pipelineStage: true, wonAt: true, lostAt: true },
    }),
    // 10. Menu weeks count
    prisma.menuWeek.count(),
    // 11. Daily attendance count
    prisma.dailyAttendance.count(),
    // 12. Services with OWNA integration
    prisma.service.count({ where: { ownaServiceId: { not: null } } }),
  ]);

  // ── Computed checks ──────────────────────────────────────────────────────
  const now = new Date();
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

  const monthlyFinancials = financialPeriods.filter(
    (f) => f.periodType === "monthly" && new Date(f.periodStart) >= threeYearsAgo,
  );
  const distinctYears = new Set(monthlyFinancials.map((f) => new Date(f.periodStart).getFullYear()));

  const computedChecks: Record<string, { status: DocumentStatus; count: number }> = {
    // Financial
    has_3yr_financials: {
      status: distinctYears.size >= 3 ? "present" : "missing",
      count: monthlyFinancials.length,
    },
    has_revenue_data: {
      status: financialPeriods.some((f) => f.totalRevenue > 0) ? "present" : "missing",
      count: financialPeriods.filter((f) => f.totalRevenue > 0).length,
    },
    has_budget_data: {
      status: financialPeriods.some((f) => f.budgetRevenue !== null) ? "present" : "missing",
      count: financialPeriods.filter((f) => f.budgetRevenue !== null).length,
    },
    has_xero_sync: {
      status: financialPeriods.some((f) => f.xeroSyncedAt !== null) ? "present" : "missing",
      count: financialPeriods.filter((f) => f.xeroSyncedAt !== null).length,
    },
    // Employment & HR
    has_active_contracts: {
      status: activeContractCount > 0 ? "present" : "missing",
      count: activeContractCount,
    },
    has_award_levels: {
      status: contractsWithAward.some((c) => c.awardLevel !== null) ? "present" : "missing",
      count: contractsWithAward.filter((c) => c.awardLevel !== null).length,
    },
    has_qualifications: {
      status: qualificationCount > 0 ? "present" : "missing",
      count: qualificationCount,
    },
    // Compliance
    has_published_policies: {
      status: policies.length > 0 ? "present" : "missing",
      count: policies.length,
    },
    has_compliance_certs: (() => {
      const relevant = complianceCerts.filter((c) =>
        ["first_aid", "cpr", "anaphylaxis", "asthma"].includes(c.type),
      );
      if (relevant.length === 0) return { status: "missing" as DocumentStatus, count: 0 };
      const hasValid = relevant.some((c) => new Date(c.expiryDate) > now);
      return { status: hasValid ? ("present" as DocumentStatus) : ("expired" as DocumentStatus), count: relevant.length };
    })(),
    // Operations
    has_menu_weeks: {
      status: menuWeekCount > 0 ? "present" : "missing",
      count: menuWeekCount,
    },
    has_attendance_data: {
      status: attendanceCount > 0 ? "present" : "missing",
      count: attendanceCount,
    },
    // Growth & Pipeline
    has_leads: {
      status: leads.length > 0 ? "present" : "missing",
      count: leads.length,
    },
    has_tenders: {
      status: leads.some((l) => l.source === "tender") ? "present" : "missing",
      count: leads.filter((l) => l.source === "tender").length,
    },
    has_won_lost_data: {
      status: leads.some((l) => l.wonAt || l.lostAt) ? "present" : "missing",
      count: leads.filter((l) => l.wonAt || l.lostAt).length,
    },
    // Technology
    has_owna_integration: {
      status: ownaServices > 0 ? "present" : "missing",
      count: ownaServices,
    },
    always_present: {
      status: "present",
      count: 1,
    },
  };

  // ── Evaluate each section ────────────────────────────────────────────────
  const sections = DATA_ROOM_SECTIONS.map((section) => {
    const items = section.requiredDocuments.map((req) => {
      let status: DocumentStatus = "missing";
      let count = 0;
      let lastUpdated: string | null = null;

      if (req.source === "document") {
        const matches = documents.filter((d) => {
          if (req.documentCategory && d.category !== req.documentCategory) return false;
          if (req.documentTitleMatch && !d.title.toLowerCase().includes(req.documentTitleMatch.toLowerCase()))
            return false;
          return true;
        });
        count = matches.length;
        status = count > 0 ? "present" : "missing";
        if (matches.length > 0) {
          const latest = matches.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          )[0];
          lastUpdated = latest.updatedAt.toISOString();
        }
      } else if (req.source === "compliance" && req.certificateType) {
        const matches = complianceCerts.filter((c) => c.type === req.certificateType);
        count = matches.length;
        if (count === 0) {
          status = "missing";
        } else {
          status = matches.some((c) => new Date(c.expiryDate) > now) ? "present" : "expired";
        }
      } else if (req.source === "metrics" && req.metricsField) {
        const field = req.metricsField;
        const hasData = centreMetrics.some((m) => {
          const value = (m as Record<string, unknown>)[field];
          return value !== null && value !== undefined && value !== 0 && value !== "";
        });
        status = hasData ? "present" : "missing";
        count = hasData ? centreMetrics.length : 0;
        if (hasData && centreMetrics.length > 0) {
          lastUpdated = centreMetrics[0].recordedAt.toISOString();
        }
      } else if (req.computedCheck && computedChecks[req.computedCheck]) {
        const check = computedChecks[req.computedCheck];
        status = check.status;
        count = check.count;
      }

      return { key: req.key, label: req.label, status, count, lastUpdated };
    });

    const presentCount = items.filter((i) => i.status === "present").length;
    const totalRequired = items.length;
    const completeness = totalRequired > 0 ? Math.round((presentCount / totalRequired) * 100) : 0;

    const latestUpdate = items
      .filter((i) => i.lastUpdated)
      .sort((a, b) => new Date(b.lastUpdated!).getTime() - new Date(a.lastUpdated!).getTime())[0]
      ?.lastUpdated ?? null;

    return {
      key: section.key,
      label: section.label,
      weight: section.weight,
      documentCount: items.reduce((sum, i) => sum + i.count, 0),
      completeness,
      presentCount,
      totalRequired,
      items,
      lastUpdated: latestUpdate,
    };
  });

  // ── Weighted overall score ───────────────────────────────────────────────
  const overallScore = Math.round(
    sections.reduce((sum, s) => sum + s.completeness * s.weight, 0) / TOTAL_WEIGHT,
  );

  return NextResponse.json({
    overallScore,
    sections,
    generatedAt: new Date().toISOString(),
  });
}, { roles: ["owner", "head_office", "admin"] });
