import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

interface Notification {
  id: string;
  type:
    | "overdue_todo"
    | "overdue_rock"
    | "unassigned_ticket"
    | "critical_issue"
    | "sla_warning"
    | "low_compliance"
    | "compliance_expiring"
    | "new_todo_assigned"
    | "new_issue_assigned"
    | "new_rock_assigned";
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  link: string;
  timestamp: string;
  entityId: string;
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error || !session) return error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const notifications: Notification[] = [];

  // Get dismissed notification IDs for this user
  const dismissed = await prisma.notificationDismissal.findMany({
    where: { userId: session.user.id },
    select: { notificationId: true },
  });
  const dismissedIds = new Set(dismissed.map((d) => d.notificationId));

  // 1. Overdue Todos: dueDate < today, status not complete/cancelled, deleted=false
  const overdueTodos = await prisma.todo.findMany({
    where: {
      deleted: false,
      status: { notIn: ["complete", "cancelled"] },
      dueDate: { lt: now },
    },
    include: { assignee: { select: { name: true } } },
    take: 20,
    orderBy: { dueDate: "asc" },
  });
  overdueTodos.forEach((todo) => {
    notifications.push({
      id: `todo-${todo.id}`,
      type: "overdue_todo",
      severity: "warning",
      title: "Overdue To-Do",
      message: `"${todo.title}" assigned to ${todo.assignee?.name ?? "Unknown"} was due ${new Date(todo.dueDate).toLocaleDateString("en-AU")}`,
      link: "/todos",
      timestamp: todo.dueDate.toISOString(),
      entityId: todo.id,
    });
  });

  // 2. Overdue Rocks: quarter != current, status in [on_track, off_track]
  const currentQuarter = `Q${Math.ceil((now.getMonth() + 1) / 3)}-${now.getFullYear()}`;
  const overdueRocks = await prisma.rock.findMany({
    where: {
      deleted: false,
      status: { in: ["on_track", "off_track"] },
      quarter: { not: currentQuarter },
    },
    include: { owner: { select: { name: true } } },
    take: 10,
  });
  overdueRocks.forEach((rock) => {
    notifications.push({
      id: `rock-${rock.id}`,
      type: "overdue_rock",
      severity: "warning",
      title: "Overdue Rock",
      message: `"${rock.title}" (${rock.quarter}) owned by ${rock.owner?.name ?? "Unknown"} is still ${rock.status.replace("_", " ")}`,
      link: "/rocks",
      timestamp: rock.updatedAt.toISOString(),
      entityId: rock.id,
    });
  });

  // 3. Unassigned tickets: assignedToId is null, status new/open
  const unassignedTickets = await prisma.supportTicket.findMany({
    where: {
      deleted: false,
      assignedToId: null,
      status: { in: ["new", "open"] },
    },
    take: 10,
    orderBy: { createdAt: "desc" },
  });
  unassignedTickets.forEach((ticket) => {
    notifications.push({
      id: `ticket-unassigned-${ticket.id}`,
      type: "unassigned_ticket",
      severity: "info",
      title: "Unassigned Ticket",
      message: `Ticket #${ticket.ticketNumber} "${ticket.subject || "No subject"}" needs assignment`,
      link: "/tickets",
      timestamp: ticket.createdAt.toISOString(),
      entityId: ticket.id,
    });
  });

  // 4. Critical issues: priority=critical, status=open
  const criticalIssues = await prisma.issue.findMany({
    where: { deleted: false, priority: "critical", status: "open" },
    take: 10,
    orderBy: { createdAt: "desc" },
  });
  criticalIssues.forEach((issue) => {
    notifications.push({
      id: `issue-${issue.id}`,
      type: "critical_issue",
      severity: "critical",
      title: "Critical Issue",
      message: `"${issue.title}" requires immediate attention`,
      link: "/issues",
      timestamp: issue.createdAt.toISOString(),
      entityId: issue.id,
    });
  });

  // 5. SLA Warning: lastInboundAt > 20 hours ago, not resolved/closed
  const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const slaTickets = await prisma.supportTicket.findMany({
    where: {
      deleted: false,
      status: { notIn: ["resolved", "closed"] },
      lastInboundAt: { lt: twentyHoursAgo, not: null },
    },
    take: 10,
    orderBy: { lastInboundAt: "asc" },
  });
  slaTickets.forEach((ticket) => {
    const hoursAgo = Math.round(
      (now.getTime() - ticket.lastInboundAt!.getTime()) / (1000 * 60 * 60)
    );
    notifications.push({
      id: `sla-${ticket.id}`,
      type: "sla_warning",
      severity: "critical",
      title: "SLA Warning",
      message: `Ticket #${ticket.ticketNumber} has had no response for ${hoursAgo}h (24h limit)`,
      link: "/tickets",
      timestamp: ticket.lastInboundAt!.toISOString(),
      entityId: ticket.id,
    });
  });

  // 6. Low compliance: overallCompliance < 80%
  const lowComplianceCentres = await prisma.centreMetrics.findMany({
    where: { overallCompliance: { lt: 80 } },
    include: { service: { select: { name: true } } },
    orderBy: { recordedAt: "desc" },
    distinct: ["serviceId"],
    take: 10,
  });
  lowComplianceCentres.forEach((metric) => {
    notifications.push({
      id: `compliance-${metric.id}`,
      type: "low_compliance",
      severity: "critical",
      title: "Low Compliance",
      message: `${metric.service.name} compliance is at ${metric.overallCompliance.toFixed(1)}% (below 80% threshold)`,
      link: "/performance",
      timestamp: metric.recordedAt.toISOString(),
      entityId: metric.serviceId,
    });
  });

  // 7. Compliance certificates expiring within 30 days
  const in30d = new Date(now.getTime() + 30 * 86400000);
  const expiringCerts = await prisma.complianceCertificate.findMany({
    where: { expiryDate: { lte: in30d } },
    include: {
      user: { select: { name: true } },
      service: { select: { name: true } },
    },
    orderBy: { expiryDate: "asc" },
    take: 20,
  });
  expiringCerts.forEach((cert) => {
    const expiry = new Date(cert.expiryDate);
    const isExpired = expiry <= now;
    const daysUntil = Math.ceil(
      (expiry.getTime() - now.getTime()) / 86400000
    );
    const urgency = isExpired
      ? "EXPIRED"
      : daysUntil <= 7
      ? "critical"
      : "warning";
    const certLabel = cert.label || cert.type.replace(/_/g, " ").toUpperCase();
    const staffName = cert.user?.name || "Unassigned";

    notifications.push({
      id: `cert-${cert.id}`,
      type: "compliance_expiring",
      severity: isExpired || daysUntil <= 7 ? "critical" : "warning",
      title: isExpired ? "Certificate Expired" : "Certificate Expiring",
      message: isExpired
        ? `${certLabel} for ${staffName} at ${cert.service.name} has expired`
        : `${certLabel} for ${staffName} at ${cert.service.name} expires in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`,
      link: "/compliance",
      timestamp: cert.expiryDate.toISOString(),
      entityId: cert.id,
    });
  });

  // 8. Newly assigned todos (last 7 days, assigned by someone else)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const assignedTodos = await prisma.todo.findMany({
    where: {
      deleted: false,
      assigneeId: session.user.id,
      createdAt: { gte: sevenDaysAgo },
      NOT: { createdById: session.user.id },
    },
    include: { createdBy: { select: { name: true } } },
    take: 10,
    orderBy: { createdAt: "desc" },
  });
  assignedTodos.forEach((todo) => {
    notifications.push({
      id: `assigned-todo-${todo.id}`,
      type: "new_todo_assigned",
      severity: "info",
      title: "New To-Do Assigned",
      message: `"${todo.title}" assigned by ${todo.createdBy?.name ?? "Unknown"}`,
      link: "/todos",
      timestamp: todo.createdAt.toISOString(),
      entityId: todo.id,
    });
  });

  // 9. Newly assigned issues (last 7 days, raised by someone else)
  const assignedIssues = await prisma.issue.findMany({
    where: {
      deleted: false,
      ownerId: session.user.id,
      createdAt: { gte: sevenDaysAgo },
      NOT: { raisedById: session.user.id },
    },
    include: { raisedBy: { select: { name: true } } },
    take: 10,
    orderBy: { createdAt: "desc" },
  });
  assignedIssues.forEach((issue) => {
    notifications.push({
      id: `assigned-issue-${issue.id}`,
      type: "new_issue_assigned",
      severity: "info",
      title: "New Issue Assigned",
      message: `"${issue.title}" raised by ${issue.raisedBy?.name ?? "Unknown"}`,
      link: "/issues",
      timestamp: issue.createdAt.toISOString(),
      entityId: issue.id,
    });
  });

  // 10. Newly assigned rocks (last 7 days)
  const assignedRocks = await prisma.rock.findMany({
    where: {
      deleted: false,
      ownerId: session.user.id,
      createdAt: { gte: sevenDaysAgo },
    },
    take: 10,
    orderBy: { createdAt: "desc" },
  });
  assignedRocks.forEach((rock) => {
    notifications.push({
      id: `assigned-rock-${rock.id}`,
      type: "new_rock_assigned",
      severity: "info",
      title: "New Rock Assigned",
      message: `"${rock.title}" was recently assigned to you`,
      link: "/rocks",
      timestamp: rock.createdAt.toISOString(),
      entityId: rock.id,
    });
  });

  // Filter out dismissed notifications
  const undismissed = notifications.filter((n) => !dismissedIds.has(n.id));

  // Enforce user notification preferences
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { notificationPrefs: true },
  });
  const prefs = (user?.notificationPrefs ?? {}) as Record<string, boolean>;
  const prefMap: Record<string, string> = {
    overdue_todo: "overdueTodos",
    overdue_rock: "rockUpdates",
    new_todo_assigned: "newAssignments",
    new_issue_assigned: "newAssignments",
    new_rock_assigned: "newAssignments",
    low_compliance: "complianceAlerts",
    compliance_expiring: "complianceAlerts",
    critical_issue: "overdueTodos", // always show critical issues
    sla_warning: "overdueTodos", // always show SLA warnings
    unassigned_ticket: "newAssignments",
  };
  const active = undismissed.filter((n) => {
    const prefKey = prefMap[n.type];
    // Default to showing if preference not explicitly set to false
    return prefKey ? prefs[prefKey] !== false : true;
  });

  // Sort: critical first, then warning, then info; within each, newest first
  const severityOrder: Record<string, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  active.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return NextResponse.json({
    notifications: active,
    total: active.length,
    critical: active.filter((n) => n.severity === "critical").length,
  });
}
