import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import {
  notificationDigestEmail,
  smartDigestEmail,
  type DigestNotification,
} from "@/lib/email-templates";
import { parseJsonField, notificationPrefsSchema } from "@/lib/schemas/json-fields";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DigestResult {
  totalUsers: number;
  emailsSent: number;
  skipped: number;
  aiInsights: number;
  errors?: string[];
}

// ---------------------------------------------------------------------------
// Main digest builder
// ---------------------------------------------------------------------------

export async function buildAndSendDailyDigest(): Promise<DigestResult> {
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

  // -- Fetch org-wide data (shared queries) --
  const [
    overdueTodos,
    overdueRocks,
    unassignedTickets,
    criticalIssues,
    slaTickets,
    lowComplianceCentres,
    expiringCerts,
    newTodos,
    newIssues,
    newRocks,
  ] = await Promise.all([
    prisma.todo.findMany({
      where: {
        deleted: false,
        status: { notIn: ["complete", "cancelled"] },
        dueDate: { lt: now },
      },
      include: { assignee: { select: { id: true, name: true } } },
      take: 100,
      orderBy: { dueDate: "asc" },
    }),
    prisma.rock.findMany({
      where: {
        deleted: false,
        status: { in: ["on_track", "off_track"] },
        quarter: { not: currentQuarter },
      },
      include: { owner: { select: { id: true, name: true } } },
      take: 50,
    }),
    prisma.supportTicket.findMany({
      where: {
        deleted: false,
        assignedToId: null,
        status: { in: ["new", "open"] },
      },
      take: 20,
      orderBy: { createdAt: "desc" },
    }),
    prisma.issue.findMany({
      where: { deleted: false, priority: "critical", status: "open" },
      take: 20,
      orderBy: { createdAt: "desc" },
    }),
    prisma.supportTicket.findMany({
      where: {
        deleted: false,
        status: { notIn: ["resolved", "closed"] },
        lastInboundAt: { lt: twentyHoursAgo, not: null },
      },
      take: 20,
      orderBy: { lastInboundAt: "asc" },
    }),
    prisma.centreMetrics.findMany({
      where: { overallCompliance: { lt: 80 } },
      include: { service: { select: { name: true } } },
      orderBy: { recordedAt: "desc" },
      distinct: ["serviceId"],
      take: 20,
    }),
    prisma.complianceCertificate.findMany({
      where: { expiryDate: { lte: in30d } },
      include: {
        user: { select: { id: true, name: true } },
        service: { select: { name: true } },
      },
      orderBy: { expiryDate: "asc" },
      take: 50,
    }),
    prisma.todo.findMany({
      where: { deleted: false, createdAt: { gte: sevenDaysAgo } },
      include: {
        createdBy: { select: { name: true } },
        assignee: { select: { id: true } },
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    }),
    prisma.issue.findMany({
      where: { deleted: false, createdAt: { gte: sevenDaysAgo } },
      include: {
        raisedBy: { select: { name: true } },
        owner: { select: { id: true } },
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    }),
    prisma.rock.findMany({
      where: { deleted: false, createdAt: { gte: sevenDaysAgo } },
      include: { owner: { select: { id: true } } },
      take: 50,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // -- Fetch AI insights (shared across users) --
  const [recentAnomalies, recentTrends, sentimentSummary, pendingLeave] =
    await Promise.all([
      prisma.attendanceAnomaly.findMany({
        where: { dismissed: false, createdAt: { gte: yesterday } },
        include: { service: { select: { name: true } } },
        orderBy: { severity: "asc" },
        take: 10,
      }),
      prisma.trendInsight.findMany({
        where: { dismissed: false, createdAt: { gte: sevenDaysAgo } },
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

  const aiInsights = buildAiInsights(recentAnomalies, recentTrends, sentimentSummary, pendingLeave);

  // -- Notification preference filter map --
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

  // -- Per-user digest --
  let emailsSent = 0;
  let skipped = 0;
  const errors: string[] = [];
  const dashboardUrl = `${process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au"}/dashboard`;

  for (const user of users) {
    const prefs = parseJsonField(user.notificationPrefs, notificationPrefsSchema, {});

    if (prefs.emailDigest === false || prefs.emailNotifications === false) {
      skipped++;
      continue;
    }

    const dismissed = await prisma.notificationDismissal.findMany({
      where: { userId: user.id },
      select: { notificationId: true },
    });
    const dismissedIds = new Set(dismissed.map((d) => d.notificationId));

    const notifications = buildUserNotifications(
      user,
      dismissedIds,
      now,
      {
        overdueTodos,
        overdueRocks,
        unassignedTickets,
        criticalIssues,
        slaTickets,
        lowComplianceCentres,
        expiringCerts,
        newTodos,
        newIssues,
        newRocks,
      }
    );

    // Apply notification preferences filter
    const filtered = notifications.filter((n) => {
      const prefKey = prefMap[n.type];
      return prefKey ? prefs[prefKey] !== false : true;
    });

    // Filter AI insights by role
    const isAdmin = ["owner", "head_office", "admin"].includes(user.role);
    const userInsights = isAdmin
      ? aiInsights
      : aiInsights.filter(
          (i) => !i.includes("Sentiment") && !i.includes("trend")
        );

    if (filtered.length === 0 && userInsights.length === 0) {
      skipped++;
      continue;
    }

    const firstName = user.name.split(" ")[0];

    try {
      if (filtered.length > 0) {
        const emailData = notificationDigestEmail(firstName, filtered, dashboardUrl);

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
        const counts = {
          overdueTodos: 0,
          offTrackRocks: 0,
          expiringCerts: 0,
          unreadAnnouncements: 0,
        };
        const emailData = smartDigestEmail(user.name, counts, userInsights, dashboardUrl);
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

  return {
    totalUsers: users.length,
    emailsSent,
    skipped,
    aiInsights: aiInsights.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

function buildAiInsights(
  recentAnomalies: any[],
  recentTrends: any[],
  sentimentSummary: any[],
  pendingLeave: number,
): string[] {
  const aiInsights: string[] = [];
  if (recentAnomalies.length > 0) {
    const highSeverity = recentAnomalies.filter((a) => a.severity === "high");
    aiInsights.push(
      `\u{1F4CA} ${recentAnomalies.length} attendance anomal${recentAnomalies.length === 1 ? "y" : "ies"} detected${highSeverity.length > 0 ? ` (${highSeverity.length} high severity)` : ""}`
    );
  }
  if (recentTrends.length > 0) {
    const warnings = recentTrends.filter((t) => t.severity !== "info");
    if (warnings.length > 0) {
      aiInsights.push(
        `\u{1F4C8} ${warnings.length} trend warning${warnings.length === 1 ? "" : "s"} need attention`
      );
    }
  }
  if (sentimentSummary.length > 0) {
    const negative = sentimentSummary.filter((s) => s.label === "negative").length;
    const total = sentimentSummary.length;
    const negPercent = Math.round((negative / total) * 100);
    if (negPercent >= 20) {
      aiInsights.push(
        `\u{1F4AC} Sentiment alert: ${negPercent}% negative feedback this week (${negative}/${total})`
      );
    }
  }
  if (pendingLeave > 0) {
    aiInsights.push(
      `\u{1F3D6}\u{FE0F} ${pendingLeave} leave request${pendingLeave === 1 ? "" : "s"} awaiting approval`
    );
  }
  return aiInsights;
}

interface OrgWideData {
  overdueTodos: any[];
  overdueRocks: any[];
  unassignedTickets: any[];
  criticalIssues: any[];
  slaTickets: any[];
  lowComplianceCentres: any[];
  expiringCerts: any[];
  newTodos: any[];
  newIssues: any[];
  newRocks: any[];
}

function buildUserNotifications(
  user: { id: string; role: string },
  dismissedIds: Set<string>,
  now: Date,
  data: OrgWideData,
): DigestNotification[] {
  const notifications: DigestNotification[] = [];
  const isAdmin = ["owner", "head_office", "admin"].includes(user.role);

  // Overdue todos
  for (const todo of data.overdueTodos) {
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
  for (const rock of data.overdueRocks) {
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
  if (isAdmin || user.role === "member") {
    for (const ticket of data.unassignedTickets) {
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

  // Critical issues
  for (const issue of data.criticalIssues) {
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
  if (isAdmin || user.role === "member") {
    for (const ticket of data.slaTickets) {
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
  if (isAdmin || user.role === "member") {
    for (const metric of data.lowComplianceCentres) {
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

  // Expiring certificates
  for (const cert of data.expiringCerts) {
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

  // Newly assigned todos
  for (const todo of data.newTodos) {
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
  for (const issue of data.newIssues) {
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
  for (const rock of data.newRocks) {
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

  return notifications;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
