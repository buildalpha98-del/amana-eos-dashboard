import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import {
  notificationDigestEmail,
  dailyDigestEmail,
  smartDigestEmail,
  type DigestNotification,
} from "@/lib/email-templates";
import { acquireCronLock } from "@/lib/cron-guard";

/**
 * GET /api/cron/daily-digest
 *
 * Daily cron (7 AM AEST / 21:00 UTC) — sends each active user a single
 * notification digest email summarising all unread notifications from the
 * last 24 hours, grouped by type with top 5 items per section.
 *
 * Also includes AI-aggregated insights (anomalies, trends, sentiment)
 * for admin/owner users.
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
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const currentQuarter = `Q${Math.ceil((now.getMonth() + 1) / 3)}-${now.getFullYear()}`;
    const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);

    // Get all active users
    const users = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        serviceId: true,
        notificationPrefs: true,
      },
    });

    // ── Fetch org-wide data (shared queries) ──────────────────

    // Overdue todos (all, we'll filter per-user below)
    const overdueTodos = await prisma.todo.findMany({
      where: {
        deleted: false,
        status: { notIn: ["complete", "cancelled"] },
        dueDate: { lt: now },
      },
      include: { assignee: { select: { id: true, name: true } } },
      take: 100,
      orderBy: { dueDate: "asc" },
    });

    // Overdue rocks
    const overdueRocks = await prisma.rock.findMany({
      where: {
        deleted: false,
        status: { in: ["on_track", "off_track"] },
        quarter: { not: currentQuarter },
      },
      include: { owner: { select: { id: true, name: true } } },
      take: 50,
    });

    // Unassigned tickets
    const unassignedTickets = await prisma.supportTicket.findMany({
      where: {
        deleted: false,
        assignedToId: null,
        status: { in: ["new", "open"] },
      },
      take: 20,
      orderBy: { createdAt: "desc" },
    });

    // Critical issues
    const criticalIssues = await prisma.issue.findMany({
      where: { deleted: false, priority: "critical", status: "open" },
      take: 20,
      orderBy: { createdAt: "desc" },
    });

    // SLA warnings
    const slaTickets = await prisma.supportTicket.findMany({
      where: {
        deleted: false,
        status: { notIn: ["resolved", "closed"] },
        lastInboundAt: { lt: twentyHoursAgo, not: null },
      },
      take: 20,
      orderBy: { lastInboundAt: "asc" },
    });

    // Low compliance centres
    const lowComplianceCentres = await prisma.centreMetrics.findMany({
      where: { overallCompliance: { lt: 80 } },
      include: { service: { select: { name: true } } },
      orderBy: { recordedAt: "desc" },
      distinct: ["serviceId"],
      take: 20,
    });

    // Expiring certificates
    const expiringCerts = await prisma.complianceCertificate.findMany({
      where: { expiryDate: { lte: in30d } },
      include: {
        user: { select: { id: true, name: true } },
        service: { select: { name: true } },
      },
      orderBy: { expiryDate: "asc" },
      take: 50,
    });

    // Newly assigned todos (last 7 days)
    const newTodos = await prisma.todo.findMany({
      where: {
        deleted: false,
        createdAt: { gte: sevenDaysAgo },
      },
      include: {
        createdBy: { select: { name: true } },
        assignee: { select: { id: true } },
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    });

    // Newly assigned issues (last 7 days)
    const newIssues = await prisma.issue.findMany({
      where: {
        deleted: false,
        createdAt: { gte: sevenDaysAgo },
      },
      include: {
        raisedBy: { select: { name: true } },
        owner: { select: { id: true } },
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    });

    // Newly assigned rocks (last 7 days)
    const newRocks = await prisma.rock.findMany({
      where: {
        deleted: false,
        createdAt: { gte: sevenDaysAgo },
      },
      include: { owner: { select: { id: true } } },
      take: 50,
      orderBy: { createdAt: "desc" },
    });

    // ── Fetch AI insights (shared across users) ──────────────

    const [recentAnomalies, recentTrends, sentimentSummary, pendingLeave] =
      await Promise.all([
        prisma.attendanceAnomaly.findMany({
          where: { dismissed: false, createdAt: { gte: yesterday } },
          include: { service: { select: { name: true } } },
          orderBy: { severity: "asc" },
          take: 10,
        }),
        prisma.trendInsight.findMany({
          where: {
            dismissed: false,
            createdAt: { gte: sevenDaysAgo },
          },
          include: { service: { select: { name: true } } },
          orderBy: { severity: "asc" },
          take: 10,
        }),
        prisma.sentimentScore.findMany({
          where: { createdAt: { gte: sevenDaysAgo } },
          select: { label: true, score: true },
        }),
        prisma.leaveRequest.count({
          where: { status: "leave_pending" },
        }),
      ]);

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
        aiInsights.push(
          `📈 ${warnings.length} trend warning${warnings.length === 1 ? "" : "s"} need attention`
        );
      }
    }
    if (sentimentSummary.length > 0) {
      const negative = sentimentSummary.filter((s) => s.label === "negative").length;
      const total = sentimentSummary.length;
      const negPercent = Math.round((negative / total) * 100);
      if (negPercent >= 20) {
        aiInsights.push(
          `💬 Sentiment alert: ${negPercent}% negative feedback this week (${negative}/${total})`
        );
      }
    }
    if (pendingLeave > 0) {
      aiInsights.push(
        `🏖️ ${pendingLeave} leave request${pendingLeave === 1 ? "" : "s"} awaiting approval`
      );
    }

    // ── Notification preference filter map ────────────────────

    const prefMap: Record<string, string> = {
      overdue_todo: "overdueTodos",
      overdue_rock: "rockUpdates",
      new_todo_assigned: "newAssignments",
      new_issue_assigned: "newAssignments",
      new_rock_assigned: "newAssignments",
      low_compliance: "complianceAlerts",
      compliance_expiring: "complianceAlerts",
      critical_issue: "overdueTodos",
      sla_warning: "overdueTodos",
      unassigned_ticket: "newAssignments",
    };

    // ── Per-user digest ───────────────────────────────────────

    let emailsSent = 0;
    let skipped = 0;
    const errors: string[] = [];
    const dashboardUrl = `${process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au"}/dashboard`;

    for (const user of users) {
      const prefs =
        (user.notificationPrefs as Record<string, boolean> | null) || {};

      // Skip users who opted out of email digest
      if (prefs.emailDigest === false || prefs.emailNotifications === false) {
        skipped++;
        continue;
      }

      // Get dismissed notification IDs for this user
      const dismissed = await prisma.notificationDismissal.findMany({
        where: { userId: user.id },
        select: { notificationId: true },
      });
      const dismissedIds = new Set(dismissed.map((d) => d.notificationId));

      // Build notification list for this user
      const notifications: DigestNotification[] = [];
      const isAdmin = ["owner", "head_office", "admin"].includes(user.role);

      // Overdue todos — show user's own + all for admins
      for (const todo of overdueTodos) {
        if (!isAdmin && todo.assignee?.id !== user.id) continue;
        const nId = `todo-${todo.id}`;
        if (dismissedIds.has(nId)) continue;
        notifications.push({
          type: "overdue_todo",
          severity: "warning",
          title: "Overdue To-Do",
          message: `"${todo.title}" assigned to ${todo.assignee?.name ?? "Unknown"} was due ${new Date(todo.dueDate).toLocaleDateString("en-AU")}`,
          link: "/todos",
        });
      }

      // Overdue rocks
      for (const rock of overdueRocks) {
        if (!isAdmin && rock.owner?.id !== user.id) continue;
        const nId = `rock-${rock.id}`;
        if (dismissedIds.has(nId)) continue;
        notifications.push({
          type: "overdue_rock",
          severity: "warning",
          title: "Overdue Rock",
          message: `"${rock.title}" (${rock.quarter}) owned by ${rock.owner?.name ?? "Unknown"} is still ${rock.status.replace("_", " ")}`,
          link: "/rocks",
        });
      }

      // Unassigned tickets (admin/coordinator only)
      if (isAdmin || user.role === "coordinator") {
        for (const ticket of unassignedTickets) {
          const nId = `ticket-unassigned-${ticket.id}`;
          if (dismissedIds.has(nId)) continue;
          notifications.push({
            type: "unassigned_ticket",
            severity: "info",
            title: "Unassigned Ticket",
            message: `Ticket #${ticket.ticketNumber} "${ticket.subject || "No subject"}" needs assignment`,
            link: "/tickets",
          });
        }
      }

      // Critical issues (everyone)
      for (const issue of criticalIssues) {
        const nId = `issue-${issue.id}`;
        if (dismissedIds.has(nId)) continue;
        notifications.push({
          type: "critical_issue",
          severity: "critical",
          title: "Critical Issue",
          message: `"${issue.title}" requires immediate attention`,
          link: "/issues",
        });
      }

      // SLA warnings (admin/coordinator only)
      if (isAdmin || user.role === "coordinator") {
        for (const ticket of slaTickets) {
          const nId = `sla-${ticket.id}`;
          if (dismissedIds.has(nId)) continue;
          const hoursAgo = Math.round(
            (now.getTime() - ticket.lastInboundAt!.getTime()) / (1000 * 60 * 60)
          );
          notifications.push({
            type: "sla_warning",
            severity: "critical",
            title: "SLA Warning",
            message: `Ticket #${ticket.ticketNumber} has had no response for ${hoursAgo}h (24h limit)`,
            link: "/tickets",
          });
        }
      }

      // Low compliance (admin/coordinator only)
      if (isAdmin || user.role === "coordinator") {
        for (const metric of lowComplianceCentres) {
          const nId = `compliance-${metric.id}`;
          if (dismissedIds.has(nId)) continue;
          notifications.push({
            type: "low_compliance",
            severity: "critical",
            title: "Low Compliance",
            message: `${metric.service.name} compliance is at ${metric.overallCompliance.toFixed(1)}% (below 80% threshold)`,
            link: "/performance",
          });
        }
      }

      // Expiring certificates (user's own + all for admins)
      for (const cert of expiringCerts) {
        if (!isAdmin && cert.user?.id !== user.id) continue;
        const nId = `cert-${cert.id}`;
        if (dismissedIds.has(nId)) continue;
        const expiry = new Date(cert.expiryDate);
        const isExpired = expiry <= now;
        const daysUntil = Math.ceil(
          (expiry.getTime() - now.getTime()) / 86400000
        );
        const certLabel =
          cert.label || cert.type.replace(/_/g, " ").toUpperCase();
        const staffName = cert.user?.name || "Unassigned";
        notifications.push({
          type: "compliance_expiring",
          severity: isExpired || daysUntil <= 7 ? "critical" : "warning",
          title: isExpired ? "Certificate Expired" : "Certificate Expiring",
          message: isExpired
            ? `${certLabel} for ${staffName} at ${cert.service.name} has expired`
            : `${certLabel} for ${staffName} at ${cert.service.name} expires in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`,
          link: "/compliance",
        });
      }

      // Newly assigned todos (assigned to this user, not by themselves)
      for (const todo of newTodos) {
        if (todo.assignee?.id !== user.id) continue;
        if (todo.createdById === user.id) continue;
        const nId = `assigned-todo-${todo.id}`;
        if (dismissedIds.has(nId)) continue;
        notifications.push({
          type: "new_todo_assigned",
          severity: "info",
          title: "New To-Do Assigned",
          message: `"${todo.title}" assigned by ${todo.createdBy?.name ?? "Unknown"}`,
          link: "/todos",
        });
      }

      // Newly assigned issues
      for (const issue of newIssues) {
        if (issue.owner?.id !== user.id) continue;
        if (issue.raisedById === user.id) continue;
        const nId = `assigned-issue-${issue.id}`;
        if (dismissedIds.has(nId)) continue;
        notifications.push({
          type: "new_issue_assigned",
          severity: "info",
          title: "New Issue Assigned",
          message: `"${issue.title}" raised by ${issue.raisedBy?.name ?? "Unknown"}`,
          link: "/issues",
        });
      }

      // Newly assigned rocks
      for (const rock of newRocks) {
        if (rock.owner?.id !== user.id) continue;
        const nId = `assigned-rock-${rock.id}`;
        if (dismissedIds.has(nId)) continue;
        notifications.push({
          type: "new_rock_assigned",
          severity: "info",
          title: "New Rock Assigned",
          message: `"${rock.title}" was recently assigned to you`,
          link: "/rocks",
        });
      }

      // Apply notification preferences filter
      const filtered = notifications.filter((n) => {
        const prefKey = prefMap[n.type];
        return prefKey ? prefs[prefKey] !== false : true;
      });

      // Filter AI insights by role
      const userInsights = isAdmin
        ? aiInsights
        : aiInsights.filter(
            (i) => !i.includes("Sentiment") && !i.includes("trend")
          );

      // Skip if nothing to report
      if (filtered.length === 0 && userInsights.length === 0) {
        skipped++;
        continue;
      }

      const firstName = user.name.split(" ")[0];

      try {
        // Use the new grouped digest if there are actual notifications
        if (filtered.length > 0) {
          // Build the notification digest with sections
          const emailData = notificationDigestEmail(
            firstName,
            filtered,
            dashboardUrl
          );

          // If there are also AI insights, append them to the subject
          const finalSubject =
            userInsights.length > 0
              ? `${emailData.subject.replace(" — Amana OSHC", "")} + ${userInsights.length} AI insight${userInsights.length > 1 ? "s" : ""} — Amana OSHC`
              : emailData.subject;

          await sendEmail({
            to: user.email,
            subject: finalSubject,
            html: emailData.html,
          });
        } else {
          // AI insights only — use the smart digest template
          const counts = {
            overdueTodos: 0,
            offTrackRocks: 0,
            expiringCerts: 0,
            unreadAnnouncements: 0,
          };
          const emailData = smartDigestEmail(
            user.name,
            counts,
            userInsights,
            dashboardUrl
          );
          await sendEmail({
            to: user.email,
            subject: emailData.subject,
            html: emailData.html,
          });
        }
        emailsSent++;
      } catch (err) {
        errors.push(
          `Failed ${user.email}: ${err instanceof Error ? err.message : "Unknown"}`
        );
      }
    }

    await guard.complete({
      totalUsers: users.length,
      emailsSent,
      skipped,
      aiInsights: aiInsights.length,
    });

    return NextResponse.json({
      message: "Daily notification digest processed",
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
