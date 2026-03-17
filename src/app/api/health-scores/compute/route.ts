import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import {
  computeHealthScore,
  type ScoreInputMetrics,
  type ScoreInputFinancials,
  type ScoreInputEOS,
} from "@/lib/health-score";

export async function POST(request: NextRequest) {
  // ── Auth: session OR cron secret ──────────────────────────
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);

  if (error) {
    // Fallback: check CRON_SECRET bearer token
    const authHeader = request.headers.get("Authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (
      !cronSecret ||
      !authHeader ||
      authHeader !== `Bearer ${cronSecret}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date();
    const currentQuarter = `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // ── Fetch all active / onboarding services ──────────────
    const services = await prisma.service.findMany({
      where: { status: { in: ["active", "onboarding"] } },
      select: { id: true },
    });

    let totalScore = 0;
    let scored = 0;

    for (const svc of services) {
      const serviceId = svc.id;

      // ── Gather data in parallel ───────────────────────────
      const [
        latestMetrics,
        latestFinancials,
        rocksTotal,
        rocksOnTrack,
        rocksComplete,
        todosOverdue,
        openIssues,
        ticketsTotal,
        ticketsResolved,
        previousHealthScore,
      ] = await Promise.all([
        // Latest CentreMetrics
        prisma.centreMetrics.findFirst({
          where: { serviceId },
          orderBy: { recordedAt: "desc" },
        }),

        // Latest FinancialPeriod (prefer monthly, fall back to weekly)
        prisma.financialPeriod.findFirst({
          where: { serviceId, periodType: "monthly" },
          orderBy: { periodStart: "desc" },
        }).then(async (monthly) => {
          if (monthly) return monthly;
          // Fall back to weekly if no monthly data
          return prisma.financialPeriod.findFirst({
            where: { serviceId, periodType: "weekly" },
            orderBy: { periodStart: "desc" },
          });
        }),

        // Rock counts — total
        prisma.rock.count({
          where: { serviceId, deleted: false, quarter: currentQuarter },
        }),

        // Rock counts — on_track
        prisma.rock.count({
          where: {
            serviceId,
            deleted: false,
            quarter: currentQuarter,
            status: "on_track",
          },
        }),

        // Rock counts — complete
        prisma.rock.count({
          where: {
            serviceId,
            deleted: false,
            quarter: currentQuarter,
            status: "complete",
          },
        }),

        // Overdue todos
        prisma.todo.count({
          where: {
            serviceId,
            deleted: false,
            status: { notIn: ["complete", "cancelled"] },
            dueDate: { lt: now },
          },
        }),

        // Open issues
        prisma.issue.count({
          where: {
            serviceId,
            deleted: false,
            status: { in: ["open", "in_discussion"] },
          },
        }),

        // Tickets total (last 90 days)
        prisma.supportTicket.count({
          where: {
            serviceId,
            deleted: false,
            createdAt: { gte: ninetyDaysAgo },
          },
        }),

        // Tickets resolved (last 90 days)
        prisma.supportTicket.count({
          where: {
            serviceId,
            deleted: false,
            createdAt: { gte: ninetyDaysAgo },
            status: "resolved",
          },
        }),

        // Previous HealthScore (latest monthly before current period)
        prisma.healthScore.findFirst({
          where: {
            serviceId,
            periodType: "monthly",
            periodStart: { lt: periodStart },
          },
          orderBy: { periodStart: "desc" },
        }),
      ]);

      // ── Build score inputs ────────────────────────────────
      const metrics: ScoreInputMetrics | null = latestMetrics
        ? {
            bscOccupancy: latestMetrics.bscOccupancy,
            ascOccupancy: latestMetrics.ascOccupancy,
            ratioCompliance: latestMetrics.ratioCompliance,
            overallCompliance: latestMetrics.overallCompliance,
            wwccCompliance: latestMetrics.wwccCompliance,
            firstAidCompliance: latestMetrics.firstAidCompliance,
            parentNps: latestMetrics.parentNps,
            incidentCount: latestMetrics.incidentCount,
            complaintCount: latestMetrics.complaintCount,
            educatorsTurnover: latestMetrics.educatorsTurnover,
            nqsRating: latestMetrics.nqsRating,
          }
        : null;

      const financials: ScoreInputFinancials | null = latestFinancials
        ? {
            margin: latestFinancials.margin,
            totalRevenue: latestFinancials.totalRevenue,
            budgetRevenue: latestFinancials.budgetRevenue,
            bscEnrolments: latestFinancials.bscEnrolments,
            ascEnrolments: latestFinancials.ascEnrolments,
          }
        : null;

      const eos: ScoreInputEOS = {
        rocksTotal,
        rocksOnTrack,
        rocksComplete,
        todosOverdue,
        openIssues,
        ticketsTotal,
        ticketsResolved,
      };

      const previousScore = previousHealthScore?.overallScore ?? null;

      // ── Compute ───────────────────────────────────────────
      const result = computeHealthScore(metrics, financials, eos, previousScore);

      // ── Upsert into HealthScore table ─────────────────────
      await prisma.healthScore.upsert({
        where: {
          serviceId_periodType_periodStart: {
            serviceId,
            periodType: "monthly",
            periodStart,
          },
        },
        create: {
          serviceId,
          periodType: "monthly",
          periodStart,
          overallScore: result.overallScore,
          trend: result.trend,
          financialScore: result.pillars.financial.score,
          operationalScore: result.pillars.operational.score,
          complianceScore: result.pillars.compliance.score,
          satisfactionScore: result.pillars.satisfaction.score,
          teamCultureScore: result.pillars.teamCulture.score,
          financialBreakdown: result.pillars.financial.breakdown,
          operationalBreakdown: result.pillars.operational.breakdown,
          complianceBreakdown: result.pillars.compliance.breakdown,
          satisfactionBreakdown: result.pillars.satisfaction.breakdown,
          teamCultureBreakdown: result.pillars.teamCulture.breakdown,
          computedAt: now,
        },
        update: {
          overallScore: result.overallScore,
          trend: result.trend,
          financialScore: result.pillars.financial.score,
          operationalScore: result.pillars.operational.score,
          complianceScore: result.pillars.compliance.score,
          satisfactionScore: result.pillars.satisfaction.score,
          teamCultureScore: result.pillars.teamCulture.score,
          financialBreakdown: result.pillars.financial.breakdown,
          operationalBreakdown: result.pillars.operational.breakdown,
          complianceBreakdown: result.pillars.compliance.breakdown,
          satisfactionBreakdown: result.pillars.satisfaction.breakdown,
          teamCultureBreakdown: result.pillars.teamCulture.breakdown,
          computedAt: now,
        },
      });

      totalScore += result.overallScore;
      scored++;
    }

    const avgScore = scored > 0 ? Math.round(totalScore / scored) : 0;

    return NextResponse.json({
      success: true,
      centresScored: scored,
      avgScore,
    });
  } catch (err) {
    console.error("[health-scores/compute] Error:", err);
    return NextResponse.json(
      { error: "Failed to compute health scores" },
      { status: 500 }
    );
  }
}
