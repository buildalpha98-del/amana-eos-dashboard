import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { sendEmail } from "@/lib/email";
import { weeklyMarketingReportEmail } from "@/lib/email-templates";
import { logger } from "@/lib/logger";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * POST /api/marketing/cockpit/weekly-report/[id]/send
 *
 * Fires the weekly marketing report email to the leadership recipient
 * (owner-role user). Updates status to `sent`.
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    const report = await prisma.weeklyMarketingReport.findUnique({
      where: { id },
      include: {
        draftedBy: false,
      },
    });
    if (!report) throw ApiError.notFound("Weekly report not found");
    if (report.status === "sent") throw ApiError.conflict("Report already sent");

    const recipient = await prisma.user.findFirst({
      where: { role: "owner", active: true },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "asc" },
    });
    if (!recipient) throw ApiError.conflict("No active owner user to receive the report");

    const akram = await prisma.user.findFirst({
      where: { role: "marketing", active: true },
      select: { id: true, name: true, email: true },
    });

    const baseUrl = process.env.NEXTAUTH_URL || "https://amanaoshc.company";

    const { subject, html } = weeklyMarketingReportEmail(recipient.name ?? "Jayden", {
      weekStart: formatDate(report.weekStart),
      weekEnd: formatDate(report.weekEnd),
      akramName: akram?.name ?? "Akram",
      wins: report.wins,
      blockers: report.blockers,
      nextWeekTop3: report.nextWeekTop3,
      bodyHtml: (report.draftBody ?? "").replace(/\n/g, "<br/>"),
      dashboardUrl: `${baseUrl}/marketing`,
    });

    try {
      await sendEmail({
        to: recipient.email,
        subject,
        html,
        replyTo: akram?.email,
      });
    } catch (err) {
      logger.error("Weekly marketing report email failed", { err, reportId: id });
      throw new ApiError(500, "Failed to send report email");
    }

    const updated = await prisma.weeklyMarketingReport.update({
      where: { id },
      data: {
        status: "sent",
        sentById: session.user.id,
        sentAt: new Date(),
      },
    });

    return NextResponse.json({ report: updated });
  },
  { roles: ["marketing", "owner"] },
);
