import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { getNetworkStaffingSummary } from "@/lib/staffing-analysis";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { staffingAlertEmail } from "@/lib/email-templates";

export async function GET(req: NextRequest) {
  // 1. Auth
  const authCheck = verifyCronSecret(req);
  if (authCheck) return authCheck.error;

  // 2. Idempotency
  const guard = await acquireCronLock("staffing-alerts", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    // 3. Analyse tomorrow's staffing across all centres
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const summary = await getNetworkStaffingSummary(tomorrow);

    // 4. Filter for actionable alerts
    const alertServices = summary.services
      .filter(
        (s) =>
          s.overallStatus === "overstaffed" ||
          s.overallStatus === "understaffed",
      )
      .map((s) => ({
        name: s.serviceName,
        status: s.overallStatus as "overstaffed" | "understaffed",
        bscVariance: s.sessions.find((ss) => ss.sessionType === "bsc")?.variance ?? 0,
        ascVariance: s.sessions.find((ss) => ss.sessionType === "asc")?.variance ?? 0,
        totalWaste: s.totalWaste,
        totalRisk: s.totalRisk,
      }));

    // 4b. Collect VIC qualification risks
    const qualificationRisks = summary.services
      .flatMap((s) =>
        s.sessions
          .filter((ss) => ss.qualificationRisk?.belowThreshold)
          .map((ss) => ({
            serviceName: s.serviceName,
            sessionType: ss.sessionType.toUpperCase(),
            diplomaPercent: ss.qualificationRisk!.diplomaPercent,
            diplomaCount: ss.qualificationRisk!.diplomaCount,
            totalRostered: ss.qualificationRisk!.totalRostered,
          })),
      );

    if (alertServices.length === 0) {
      await guard.complete({
        date: summary.date,
        alertCount: 0,
        message: "All centres optimally staffed",
      });
      return NextResponse.json({
        message: "No staffing alerts for tomorrow",
        date: summary.date,
      });
    }

    // 5. Send email to all admin/owner users
    const resend = getResend();
    let emailsSent = 0;
    const errors: string[] = [];

    if (resend) {
      const admins = await prisma.user.findMany({
        where: {
          active: true,
          role: { in: ["owner", "admin"] },
        },
        select: { name: true, email: true },
      });

      const dashboardUrl =
        process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

      for (const admin of admins) {
        try {
          const { subject, html } = staffingAlertEmail(
            admin.name.split(" ")[0],
            summary.date,
            alertServices,
            `${dashboardUrl}/dashboard`,
            qualificationRisks,
          );

          await resend.emails.send({
            from: FROM_EMAIL,
            to: admin.email,
            subject,
            html,
          });
          emailsSent++;
        } catch (err) {
          errors.push(
            `Failed ${admin.email}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    await guard.complete({
      date: summary.date,
      alertCount: alertServices.length,
      overstaffed: summary.overstaffedCount,
      understaffed: summary.understaffedCount,
      totalWaste: summary.totalWaste,
      totalRisk: summary.totalRisk,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });

    return NextResponse.json({
      message: "Staffing alerts processed",
      date: summary.date,
      alertCount: alertServices.length,
      overstaffed: summary.overstaffedCount,
      understaffed: summary.understaffedCount,
      totalWaste: summary.totalWaste,
      totalRisk: summary.totalRisk,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    console.error("Staffing alerts cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
}
