/**
 * Microsoft Teams webhook notification helper.
 *
 * Uses Power Automate Workflow webhooks (NOT the deprecated Office 365 Connectors).
 * No npm packages needed — just native `fetch()`.
 *
 * Setup:
 *  1. In Teams → channel → … → Workflows → "Post to a channel when a webhook request is received"
 *  2. Copy the webhook URL into the `TEAMS_WEBHOOK_URL` env variable.
 *
 * Rate limits: 4 requests/sec, max 28 KB per message.
 */

// ── Types ────────────────────────────────────────────────

interface AdaptiveCardAction {
  type: "Action.OpenUrl";
  title: string;
  url: string;
}

interface AdaptiveCardFact {
  title: string;
  value: string;
}

interface TeamsNotifyOptions {
  title: string;
  body: string;
  /** Hex colour for the accent strip (default: Amana brand #004E64) */
  accentColor?: string;
  facts?: AdaptiveCardFact[];
  actions?: AdaptiveCardAction[];
}

// ── Helpers ──────────────────────────────────────────────

function buildAdaptiveCard(opts: TeamsNotifyOptions) {
  const items: Record<string, unknown>[] = [
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      text: opts.title,
      wrap: true,
      color: "Accent",
    },
    {
      type: "TextBlock",
      text: opts.body,
      wrap: true,
    },
  ];

  if (opts.facts?.length) {
    items.push({
      type: "FactSet",
      facts: opts.facts,
    });
  }

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          msteams: {
            width: "Full",
          },
          body: items,
          actions: opts.actions || [],
        },
      },
    ],
  };
}

// ── Core send function ───────────────────────────────────

export async function sendTeamsNotification(
  opts: TeamsNotifyOptions
): Promise<boolean> {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("[TEAMS] No TEAMS_WEBHOOK_URL set — notification skipped:", opts.title);
    return false;
  }

  try {
    const payload = buildAdaptiveCard(opts);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[TEAMS] Webhook returned ${res.status}: ${text}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[TEAMS] Webhook error:", err);
    return false;
  }
}

// ── Pre-built notification helpers ───────────────────────

/** Ticket assigned or updated */
export function notifyTicketAssigned(ticket: {
  ticketNumber: number;
  subject: string | null;
  priority: string;
  assignedTo: string;
  raisedBy?: string;
  url: string;
}) {
  return sendTeamsNotification({
    title: `🎫 Ticket #${ticket.ticketNumber} Assigned`,
    body: `**${ticket.subject || `Ticket #${ticket.ticketNumber}`}** has been assigned to **${ticket.assignedTo}**.`,
    facts: [
      { title: "Priority", value: ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1) },
      ...(ticket.raisedBy ? [{ title: "Raised By", value: ticket.raisedBy }] : []),
      { title: "Assigned To", value: ticket.assignedTo },
    ],
    actions: [{ type: "Action.OpenUrl" as const, title: "View Ticket", url: ticket.url }],
  });
}

/** Ticket status changed */
export function notifyTicketStatusChange(ticket: {
  ticketNumber: number;
  subject: string | null;
  newStatus: string;
  url: string;
}) {
  const statusLabel = ticket.newStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return sendTeamsNotification({
    title: `🎫 Ticket #${ticket.ticketNumber} → ${statusLabel}`,
    body: `**${ticket.subject || `Ticket #${ticket.ticketNumber}`}** status changed to **${statusLabel}**.`,
    actions: [{ type: "Action.OpenUrl" as const, title: "View Ticket", url: ticket.url }],
  });
}

/** New Rock created */
export function notifyNewRock(rock: {
  title: string;
  owner: string;
  quarter: string;
  url: string;
}) {
  return sendTeamsNotification({
    title: "🪨 New Rock Created",
    body: `**${rock.title}** has been created for **${rock.quarter}**.`,
    facts: [
      { title: "Owner", value: rock.owner },
      { title: "Quarter", value: rock.quarter },
    ],
    actions: [{ type: "Action.OpenUrl" as const, title: "View Rock", url: rock.url }],
  });
}

/** Issue escalated / opened */
export function notifyNewIssue(issue: {
  title: string;
  priority: string;
  raisedBy: string;
  url: string;
}) {
  const emoji = issue.priority === "critical" ? "🔴" : issue.priority === "high" ? "🟠" : "🟡";
  return sendTeamsNotification({
    title: `${emoji} New Issue: ${issue.title}`,
    body: `A **${issue.priority}** priority issue has been raised by **${issue.raisedBy}**.`,
    facts: [
      { title: "Priority", value: issue.priority.charAt(0).toUpperCase() + issue.priority.slice(1) },
      { title: "Raised By", value: issue.raisedBy },
    ],
    actions: [{ type: "Action.OpenUrl" as const, title: "View Issue", url: issue.url }],
  });
}

/** To-Do overdue reminder */
export function notifyOverdueTodos(data: {
  count: number;
  assignee: string;
  url: string;
}) {
  return sendTeamsNotification({
    title: "⏰ Overdue To-Dos",
    body: `**${data.assignee}** has **${data.count}** overdue to-do${data.count === 1 ? "" : "s"}.`,
    actions: [{ type: "Action.OpenUrl" as const, title: "View To-Dos", url: data.url }],
  });
}

/** Project milestone completed */
export function notifyProjectMilestone(project: {
  name: string;
  milestone: string;
  url: string;
}) {
  return sendTeamsNotification({
    title: "✅ Project Milestone",
    body: `**${project.name}**: milestone **${project.milestone}** completed.`,
    actions: [{ type: "Action.OpenUrl" as const, title: "View Project", url: project.url }],
  });
}

// ── Automation-wired notifications ──────────────────────

/** Rock auto-flagged as off-track by escalation cron */
export function notifyRockOffTrack(rock: {
  title: string;
  owner: string;
  quarter: string;
  percentComplete: number;
  url: string;
}) {
  return sendTeamsNotification({
    title: "🪨 Rock Flagged Off-Track",
    body: `**${rock.title}** owned by **${rock.owner}** is behind schedule at **${rock.percentComplete}%** completion.`,
    accentColor: "#f59e0b",
    facts: [
      { title: "Owner", value: rock.owner },
      { title: "Quarter", value: rock.quarter },
      { title: "Progress", value: `${rock.percentComplete}%` },
    ],
    actions: [{ type: "Action.OpenUrl" as const, title: "View Rocks", url: rock.url }],
  });
}

/** Stale issues alert from escalation cron */
export function notifyStaleIssues(data: {
  count: number;
  url: string;
}) {
  return sendTeamsNotification({
    title: "⚠️ Stale Issues",
    body: `**${data.count}** issue${data.count === 1 ? "" : "s"} have been open for over 14 days with no recent activity.`,
    accentColor: "#f97316",
    actions: [{ type: "Action.OpenUrl" as const, title: "View Issues", url: data.url }],
  });
}

/** Weekly leadership summary from report cron */
export function notifyWeeklySummary(data: {
  centres: number;
  totalRevenue: number;
  avgOccupancy: number;
  overdueTodos: number;
  url: string;
}) {
  return sendTeamsNotification({
    title: "📊 Weekly Leadership Summary",
    body: `**${data.centres}** centres reporting. Avg occupancy **${data.avgOccupancy}%**, estimated revenue **$${data.totalRevenue.toLocaleString("en-AU", { minimumFractionDigits: 0 })}**.`,
    facts: [
      { title: "Centres Reporting", value: `${data.centres}` },
      { title: "Est. Revenue", value: `$${data.totalRevenue.toLocaleString("en-AU", { minimumFractionDigits: 0 })}` },
      { title: "Avg Occupancy", value: `${data.avgOccupancy}%` },
      { title: "Overdue To-Dos", value: `${data.overdueTodos}` },
    ],
    actions: [{ type: "Action.OpenUrl" as const, title: "Open Dashboard", url: data.url }],
  });
}

/** Low occupancy alert from attendance cron */
export function notifyLowOccupancy(data: {
  service: string;
  sessionType: string;
  occupancyPct: number;
  date: string;
  url: string;
}) {
  const emoji = data.occupancyPct < 40 ? "🔴" : "🟡";
  return sendTeamsNotification({
    title: `${emoji} Low Occupancy: ${data.service}`,
    body: `**${data.sessionType}** occupancy at **${data.occupancyPct}%** on ${data.date}.`,
    accentColor: data.occupancyPct < 40 ? "#dc2626" : "#f59e0b",
    facts: [
      { title: "Centre", value: data.service },
      { title: "Session", value: data.sessionType },
      { title: "Occupancy", value: `${data.occupancyPct}%` },
      { title: "Date", value: data.date },
    ],
    actions: [{ type: "Action.OpenUrl" as const, title: "View Service", url: data.url }],
  });
}
