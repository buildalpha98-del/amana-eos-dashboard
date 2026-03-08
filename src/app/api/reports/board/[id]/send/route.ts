import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { boardReportEmail } from "@/lib/email-templates";
import type { BoardReportData } from "@/lib/board-report-generator";

/**
 * POST /api/reports/board/[id]/send — Send the report to board members
 *
 * Body (optional): { recipients?: string[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const report = await prisma.boardReport.findUnique({ where: { id } });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  let recipients: string[] = body.recipients || [];

  // Default to all owner/admin users if no recipients specified
  if (recipients.length === 0) {
    const admins = await prisma.user.findMany({
      where: { role: { in: ["owner", "admin"] }, active: true },
      select: { email: true },
    });
    recipients = admins.map((a) => a.email);
  }

  const resend = getResend();
  if (!resend) {
    return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
  }

  const reportData = report.data as unknown as BoardReportData;
  const monthName = new Date(report.year, report.month - 1).toLocaleDateString("en-AU", {
    month: "long",
  });
  const baseUrl = process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

  let emailsSent = 0;
  for (const recipient of recipients) {
    try {
      const { subject, html } = boardReportEmail(recipient.split("@")[0], {
        month: monthName,
        year: report.year,
        totalRevenue: reportData.financial.totalRevenue,
        grossProfit: reportData.financial.grossProfit,
        avgMargin: reportData.financial.avgMargin,
        avgOccupancy: Math.round(
          (reportData.operations.avgBscOccupancy + reportData.operations.avgAscOccupancy) / 2,
        ),
        activeStaff: reportData.people.activeStaff,
        rocksOnTrack: reportData.rocks.onTrack + reportData.rocks.complete,
        rocksTotal: reportData.rocks.total,
        executiveSummary: report.executiveSummary || "",
        dashboardUrl: `${baseUrl}/reports/board`,
      });

      await resend.emails.send({ from: FROM_EMAIL, to: recipient, subject, html });
      emailsSent++;
    } catch (err) {
      console.error(`Board report email to ${recipient} failed:`, err);
    }
  }

  // Update report status
  await prisma.boardReport.update({
    where: { id },
    data: {
      status: "sent",
      sentAt: new Date(),
      sentById: session!.user.id,
    },
  });

  return NextResponse.json({ success: true, emailsSent });
}
