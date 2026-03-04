import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { todoReminderEmail } from "@/lib/email-templates";
import {
  notifyOverdueTodos,
  notifyRockOffTrack,
  notifyStaleIssues,
} from "@/lib/teams-notify";

/**
 * GET /api/cron/auto-escalation
 *
 * Daily cron (8:30 AM AEST) — smart escalation for rocks, todos, and issues.
 *
 * 1. Overdue todos: email + in-app notification + Teams
 * 2. Off-track rocks: auto-flag + email + Teams
 * 3. Stale issues: flag issues open > 14 days without activity
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const baseUrl = process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";
    const resend = getResend();
    let emailsSent = 0;
    const errors: string[] = [];

    // ── 1. Overdue Todos ──────────────────────────────────────

    const overdueTodos = await prisma.todo.findMany({
      where: {
        deleted: false,
        status: { in: ["pending", "in_progress"] },
        dueDate: { lt: now },
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    // Group by assignee
    const todosByUser = new Map<
      string,
      { name: string; email: string; todos: { title: string; dueDate: string }[] }
    >();

    for (const todo of overdueTodos) {
      const userId = todo.assignee.id;
      if (!todosByUser.has(userId)) {
        todosByUser.set(userId, {
          name: todo.assignee.name,
          email: todo.assignee.email,
          todos: [],
        });
      }
      todosByUser.get(userId)!.todos.push({
        title: todo.title,
        dueDate: new Date(todo.dueDate).toLocaleDateString("en-AU"),
      });
    }

    // Send per-user overdue todo emails
    if (resend) {
      for (const [, user] of todosByUser) {
        try {
          const { subject, html } = todoReminderEmail(
            user.name,
            user.todos,
            `${baseUrl}/todos`
          );
          await resend.emails.send({ from: FROM_EMAIL, to: user.email, subject, html });
          emailsSent++;
        } catch (err) {
          errors.push(`Todo email ${user.email}: ${err instanceof Error ? err.message : "Unknown"}`);
        }
      }
    }

    // Teams notification per user with overdue todos
    for (const [, user] of todosByUser) {
      notifyOverdueTodos({
        count: user.todos.length,
        assignee: user.name,
        url: `${baseUrl}/todos`,
      }).catch(() => {});
    }

    // ── 2. Off-Track Rocks ────────────────────────────────────

    // Determine expected progress based on quarter timeline
    const currentMonth = now.getMonth() + 1;
    const currentQuarter = Math.ceil(currentMonth / 3);
    const currentYear = now.getFullYear();
    const quarterStr = `Q${currentQuarter}-${currentYear}`;

    // Quarter start/end months
    const qStartMonth = (currentQuarter - 1) * 3 + 1;
    const qStart = new Date(currentYear, qStartMonth - 1, 1);
    const qEnd = new Date(currentYear, qStartMonth + 2, 0); // last day of quarter
    const totalDays = (qEnd.getTime() - qStart.getTime()) / 86400000;
    const elapsedDays = Math.max(0, (now.getTime() - qStart.getTime()) / 86400000);
    const expectedProgress = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

    // Find on-track rocks that should be flagged off-track
    const rocksToEscalate = await prisma.rock.findMany({
      where: {
        deleted: false,
        status: "on_track",
        quarter: quarterStr,
        percentComplete: { lt: Math.max(0, expectedProgress - 15) }, // 15% grace buffer
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });

    let rocksEscalated = 0;
    for (const rock of rocksToEscalate) {
      try {
        // Auto-flip to off_track
        await prisma.rock.update({
          where: { id: rock.id },
          data: { status: "off_track" },
        });
        rocksEscalated++;

        // Teams notification
        notifyRockOffTrack({
          title: rock.title,
          owner: rock.owner.name,
          quarter: rock.quarter,
          percentComplete: rock.percentComplete,
          url: `${baseUrl}/rocks`,
        }).catch(() => {});
      } catch (err) {
        errors.push(`Rock escalation ${rock.id}: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    // ── 3. Stale Issues ───────────────────────────────────────

    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
    const staleIssues = await prisma.issue.findMany({
      where: {
        deleted: false,
        status: { in: ["open", "in_discussion"] },
        updatedAt: { lt: fourteenDaysAgo },
      },
      select: { id: true },
    });

    if (staleIssues.length > 0) {
      notifyStaleIssues({
        count: staleIssues.length,
        url: `${baseUrl}/issues`,
      }).catch(() => {});
    }

    return NextResponse.json({
      message: "Auto-escalation complete",
      overdueTodos: {
        total: overdueTodos.length,
        usersNotified: todosByUser.size,
      },
      rocks: {
        escalated: rocksEscalated,
        expectedProgress,
        quarter: quarterStr,
      },
      staleIssues: staleIssues.length,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Auto-escalation cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
