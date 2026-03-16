import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, FROM_EMAIL } from "@/lib/email";
import { dailyDigestEmail, smartDigestEmail } from "@/lib/email-templates";
import { acquireCronLock } from "@/lib/cron-guard";

/**
 * GET /api/cron/daily-digest
 *
 * Daily cron (8 AM AEST) — sends a morning digest email to each active user
 * with their overdue todos, off-track rocks, expiring certs, unread announcements,
 * PLUS AI-aggregated insights from anomalies, trends, and sentiment.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Idempotency guard — prevent duplicate digest emails on retry
  const guard = await acquireCronLock("daily-digest", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const in30d = new Date(now.getTime() + 30 * 86400000);
    const yesterday = new Date(now.getTime() - 86400000);

    // Get all active users
    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, role: true, serviceId: true, notificationPrefs: true },
    });

    // Fetch org-wide AI insights (shared across all users)
    const [recentAnomalies, recentTrends, sentimentSummary, pendingLeave] = await Promise.all([
      // Undismissed anomalies from the last 24 hours
      prisma.attendanceAnomaly.findMany({
        where: { dismissed: false, createdAt: { gte: yesterday } },
        include: { service: { select: { name: true } } },
        orderBy: { severity: "asc" },
        take: 10,
      }),
      // Recent trend insights (undismissed)
      prisma.trendInsight.findMany({
        where: { dismissed: false, createdAt: { gte: new Date(now.getTime() - 7 * 86400000) } },
        include: { service: { select: { name: true } } },
        orderBy: { severity: "asc" },
        take: 10,
      }),
      // Sentiment from the last 7 days
      prisma.sentimentScore.findMany({
        where: { createdAt: { gte: new Date(now.getTime() - 7 * 86400000) } },
        select: { label: true, score: true },
      }),
      // Pending leave requests
      prisma.leaveRequest.count({
        where: { status: "leave_pending" },
      }),
    ]);

    // Build AI insights summary
    const aiInsights: string[] = [];

    if (recentAnomalies.length > 0) {
      const highSeverity = recentAnomalies.filter((a) => a.severity === "high");
      aiInsights.push(
        `📊 ${recentAnomalies.length} attendance anomal${recentAnomalies.length === 1 ? "y" : "ies"} detected${highSeverity.length > 0 ? ` (${highSeverity.length} high severity)` : ""}`
      );
    }

    if (recentTrends.length > 0) {
      const warnings = recentTrends.filter((t) => t.severity !== "info");
      if (warnings.length > 0) {
        aiInsights.push(`📈 ${warnings.length} trend warning${warnings.length === 1 ? "" : "s"} need attention`);
      }
    }

    if (sentimentSummary.length > 0) {
      const negative = sentimentSummary.filter((s) => s.label === "negative").length;
      const total = sentimentSummary.length;
      const negPercent = Math.round((negative / total) * 100);
      if (negPercent >= 20) {
        aiInsights.push(`💬 Sentiment alert: ${negPercent}% negative feedback this week (${negative}/${total})`);
      }
    }

    if (pendingLeave > 0) {
      aiInsights.push(`🏖️ ${pendingLeave} leave request${pendingLeave === 1 ? "" : "s"} awaiting approval`);
    }

    let emailsSent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const user of users) {
      // Check notification preferences
      const prefs = (user.notificationPrefs as Record<string, boolean> | null) || {};
      if (prefs.emailNotifications === false) {
        skipped++;
        continue;
      }

      // Overdue todos
      const overdueTodos = await prisma.todo.count({
        where: {
          assigneeId: user.id,
          status: { in: ["pending", "in_progress"] },
          dueDate: { lt: now },
        },
      });

      // Off-track rocks
      const offTrackRocks = await prisma.rock.count({
        where: {
          ownerId: user.id,
          status: "off_track",
        },
      });

      // Expiring compliance certs (within 30 days)
      const expiringCerts = await prisma.complianceCertificate.count({
        where: {
          userId: user.id,
          expiryDate: { lte: in30d },
        },
      });

      // Unread announcements
      const unreadAnnouncements = await prisma.announcement.count({
        where: {
          deleted: false,
          readReceipts: { none: { userId: user.id } },
          ...(user.serviceId
            ? {
                OR: [
                  { audience: "all" },
                  { serviceId: user.serviceId },
                ],
              }
            : {}),
        },
      });

      const counts = { overdueTodos, offTrackRocks, expiringCerts, unreadAnnouncements };
      const total = overdueTodos + offTrackRocks + expiringCerts + unreadAnnouncements;

      // Filter AI insights by role — show all to admins/owners, limited to coordinators
      const isAdmin = ["owner", "head_office", "admin"].includes(user.role);
      const userInsights = isAdmin ? aiInsights : aiInsights.filter((i) => !i.includes("Sentiment") && !i.includes("trend"));

      // Skip if nothing to report (no items AND no AI insights)
      if (total === 0 && userInsights.length === 0) {
        skipped++;
        continue;
      }

      const dashboardUrl = `${process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au"}/dashboard`;

      try {
        // Use smart digest if there are AI insights, otherwise fallback to basic
        const emailData = userInsights.length > 0
          ? smartDigestEmail(user.name, counts, userInsights, dashboardUrl)
          : dailyDigestEmail(user.name, counts, dashboardUrl);

        await sendEmail({
          to: user.email,
          subject: emailData.subject,
          html: emailData.html,
        });
        emailsSent++;
      } catch (err) {
        errors.push(`Failed ${user.email}: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    await guard.complete({ totalUsers: users.length, emailsSent, skipped, aiInsights: aiInsights.length });

    return NextResponse.json({
      message: "Daily digest processed",
      totalUsers: users.length,
      emailsSent,
      skipped,
      aiInsights: aiInsights.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    console.error("Daily digest cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
