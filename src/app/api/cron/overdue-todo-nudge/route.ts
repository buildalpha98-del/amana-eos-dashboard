import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { acquireCronLock } from "@/lib/cron-guard";

const BRAND_COLOR = "#004E64";
const ACCENT_COLOR = "#FECE00";
const DASHBOARD_URL =
  process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

interface OverdueTodo {
  id: string;
  title: string;
  dueDate: Date;
  daysOverdue: number;
}

function buildNudgeEmail(
  assigneeName: string,
  todos: OverdueTodo[],
): { subject: string; html: string } {
  const subject =
    todos.length === 1
      ? `Reminder: 1 overdue to-do needs your attention`
      : `Reminder: ${todos.length} overdue to-dos need your attention`;

  const rows = todos
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .map((t) => {
      const urgencyColor =
        t.daysOverdue > 7
          ? "#dc2626"
          : t.daysOverdue > 3
          ? "#f59e0b"
          : "#6b7280";
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${t.title}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${t.dueDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
            <span style="color:${urgencyColor};font-weight:600;">${t.daysOverdue} day${t.daysOverdue === 1 ? "" : "s"}</span>
          </td>
        </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${BRAND_COLOR};padding:24px;text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:20px;">Amana OSHC</h1>
      </div>
      <div style="padding:24px;background:#ffffff;">
        <p style="margin:0 0 16px;">Hi ${assigneeName},</p>
        <p style="margin:0 0 16px;">You have <strong>${todos.length} overdue to-do${todos.length === 1 ? "" : "s"}</strong> that need your attention:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:${BRAND_COLOR};color:#ffffff;">
              <th style="padding:8px 12px;text-align:left;">To-Do</th>
              <th style="padding:8px 12px;text-align:left;">Due Date</th>
              <th style="padding:8px 12px;text-align:left;">Overdue</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin:16px 0;">Please complete or update these items as soon as possible.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${DASHBOARD_URL}/todos" style="display:inline-block;padding:12px 24px;background:${ACCENT_COLOR};color:${BRAND_COLOR};font-weight:600;text-decoration:none;border-radius:6px;">View My To-Dos</a>
        </div>
      </div>
      <div style="background:#f3f4f6;padding:16px;text-align:center;font-size:12px;color:#6b7280;">
        Amana OSHC &mdash; Overdue To-Do Reminder
      </div>
    </div>`;

  return { subject, html };
}

function buildAdminSummaryEmail(
  userSummaries: { name: string; count: number }[],
  totalOverdue: number,
): { subject: string; html: string } {
  const subject = `[Admin] ${totalOverdue} overdue to-do${totalOverdue === 1 ? "" : "s"} across ${userSummaries.length} staff`;

  const rows = userSummaries
    .sort((a, b) => b.count - a.count)
    .map(
      (u) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${u.name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">
          <span style="color:${u.count > 5 ? "#dc2626" : u.count > 2 ? "#f59e0b" : "#6b7280"};font-weight:600;">${u.count}</span>
        </td>
      </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${BRAND_COLOR};padding:24px;text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:20px;">Amana OSHC &mdash; Admin Summary</h1>
      </div>
      <div style="padding:24px;background:#ffffff;">
        <h2 style="margin:0 0 16px;font-size:18px;">Overdue To-Do Summary</h2>
        <div style="display:flex;gap:12px;margin-bottom:20px;">
          <div style="flex:1;padding:12px;background:#fef2f2;border-radius:8px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:#dc2626;">${totalOverdue}</div>
            <div style="font-size:12px;color:#6b7280;">Total Overdue</div>
          </div>
          <div style="flex:1;padding:12px;background:#fffbeb;border-radius:8px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:#f59e0b;">${userSummaries.length}</div>
            <div style="font-size:12px;color:#6b7280;">Staff Affected</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:${BRAND_COLOR};color:#ffffff;">
              <th style="padding:6px 10px;text-align:left;">Staff Member</th>
              <th style="padding:6px 10px;text-align:left;">Overdue Count</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="text-align:center;margin:24px 0;">
          <a href="${DASHBOARD_URL}/todos" style="display:inline-block;padding:12px 24px;background:${ACCENT_COLOR};color:${BRAND_COLOR};font-weight:600;text-decoration:none;border-radius:6px;">View All To-Dos</a>
        </div>
      </div>
      <div style="background:#f3f4f6;padding:16px;text-align:center;font-size:12px;color:#6b7280;">
        Amana OSHC &mdash; Overdue To-Do Nudge (Admin)
      </div>
    </div>`;

  return { subject, html };
}

/**
 * GET /api/cron/overdue-todo-nudge
 *
 * Daily cron (8 AM AEST / 22:00 UTC previous day) — finds overdue
 * todos and sends nudge emails to assignees + admin summary.
 *
 * Respects user notification preferences (overdueTodos toggle).
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("overdue-todo-nudge", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();

    // Find all overdue, pending, non-deleted todos with their assignees
    const overdueTodos = await prisma.todo.findMany({
      where: {
        dueDate: { lt: now },
        status: "pending",
        deleted: false,
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            notificationPrefs: true,
            active: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    if (overdueTodos.length === 0) {
      await guard.complete({ totalOverdue: 0, emailsSent: 0 });
      return NextResponse.json({
        message: "No overdue todos found",
        totalOverdue: 0,
        emailsSent: 0,
      });
    }

    // Group by assignee, filtering by active + notification prefs
    const byAssignee = new Map<
      string,
      {
        name: string;
        email: string;
        todos: OverdueTodo[];
      }
    >();

    for (const todo of overdueTodos) {
      if (!todo.assignee || !todo.assignee.active) continue;

      // Respect notification preferences
      const prefs = todo.assignee.notificationPrefs as Record<string, boolean> | null;
      if (prefs && prefs.overdueTodos === false) continue;

      const daysOverdue = Math.floor(
        (now.getTime() - new Date(todo.dueDate).getTime()) / 86400000,
      );

      if (!byAssignee.has(todo.assignee.id)) {
        byAssignee.set(todo.assignee.id, {
          name: todo.assignee.name,
          email: todo.assignee.email,
          todos: [],
        });
      }

      byAssignee.get(todo.assignee.id)!.todos.push({
        id: todo.id,
        title: todo.title,
        dueDate: todo.dueDate,
        daysOverdue,
      });
    }

    let emailsSent = 0;
    const errors: string[] = [];
    const userSummaries: { name: string; count: number }[] = [];

    // Send per-assignee nudge emails
    for (const [, assignee] of byAssignee) {
      userSummaries.push({ name: assignee.name, count: assignee.todos.length });

      try {
        const { subject, html } = buildNudgeEmail(
          assignee.name,
          assignee.todos,
        );
        await sendEmail({ to: assignee.email, subject, html });
        emailsSent++;
      } catch (err) {
        errors.push(
          `Failed to email ${assignee.email}: ${err instanceof Error ? err.message : "Unknown"}`,
        );
      }
    }

    // Admin summary
    if (userSummaries.length > 0) {
      const admins = await prisma.user.findMany({
        where: { role: { in: ["owner", "admin"] }, active: true },
        select: { email: true },
      });

      const totalOverdue = userSummaries.reduce((sum, u) => sum + u.count, 0);
      const { subject, html } = buildAdminSummaryEmail(
        userSummaries,
        totalOverdue,
      );

      for (const admin of admins) {
        try {
          await sendEmail({ to: admin.email, subject, html });
          emailsSent++;
        } catch (err) {
          errors.push(
            `Failed admin email ${admin.email}: ${err instanceof Error ? err.message : "Unknown"}`,
          );
        }
      }
    }

    const totalNudged = userSummaries.reduce((sum, u) => sum + u.count, 0);

    await guard.complete({
      totalOverdue: overdueTodos.length,
      usersNudged: userSummaries.length,
      todosNudged: totalNudged,
      emailsSent,
    });

    return NextResponse.json({
      message: "Overdue todo nudge processed",
      totalOverdue: overdueTodos.length,
      usersNudged: userSummaries.length,
      todosNudged: totalNudged,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    console.error("Overdue todo nudge cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
}
