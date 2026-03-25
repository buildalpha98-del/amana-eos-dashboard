import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import {
  generateDraft,
  saveDraft,
  type TaskContext,
} from "@/lib/ai-task-agent";

/**
 * GET /api/cron/ai-task-agent
 *
 * Hourly cron — finds up to 20 actionable tasks across all 5 sources
 * (todos, marketing tasks, cowork todos, tickets, issues) that don't
 * already have an AI draft, generates a draft for each, and saves it.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Skip if ANTHROPIC_API_KEY is not configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ message: "ANTHROPIC_API_KEY not configured, skipping", skipped: true });
  }

  const guard = await acquireCronLock("ai-task-agent", "hourly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const contexts: TaskContext[] = [];

    // ── 1. Todos (pending/in_progress, no ready/accepted draft) ──────────
    const todos = await prisma.todo.findMany({
      where: {
        deleted: false,
        status: { in: ["pending", "in_progress"] },
        aiDrafts: { none: { status: { in: ["ready", "accepted"] } } },
      },
      include: {
        assignee: { select: { name: true, role: true } },
        service: { select: { name: true, code: true } },
        rock: { select: { title: true } },
        issue: { select: { title: true } },
      },
      orderBy: [{ dueDate: "asc" }],
      take: 5,
    });

    for (const t of todos) {
      contexts.push({
        sourceType: "todo",
        sourceId: t.id,
        title: t.title,
        description: t.description,
        assigneeName: t.assignee?.name,
        assigneeRole: t.assignee?.role,
        serviceName: t.service?.name,
        serviceCode: t.service?.code,
        linkedRock: t.rock?.title,
        linkedIssue: t.issue?.title,
        priority: t.status,
        dueDate: t.dueDate,
      });
    }

    // ── 2. Marketing tasks (todo/in_progress, no ready/accepted draft) ───
    const marketingTasks = await prisma.marketingTask.findMany({
      where: {
        deleted: false,
        status: { in: ["todo", "in_progress"] },
        aiDrafts: { none: { status: { in: ["ready", "accepted"] } } },
      },
      include: {
        assignee: { select: { name: true, role: true } },
        service: { select: { name: true, code: true } },
      },
      orderBy: [{ dueDate: "asc" }],
      take: 5,
    });

    for (const mt of marketingTasks) {
      contexts.push({
        sourceType: "marketingTask",
        sourceId: mt.id,
        title: mt.title,
        description: mt.description,
        assigneeName: mt.assignee?.name,
        assigneeRole: mt.assignee?.role,
        serviceName: mt.service?.name,
        serviceCode: mt.service?.code,
        priority: mt.priority,
        dueDate: mt.dueDate,
      });
    }

    // ── 3. Cowork todos (not completed, no ready/accepted draft) ─────────
    const coworkTodos = await prisma.coworkTodo.findMany({
      where: {
        completed: false,
        aiDrafts: { none: { status: { in: ["ready", "accepted"] } } },
      },
      include: {
        assignedTo: { select: { name: true, role: true } },
      },
      orderBy: [{ date: "asc" }],
      take: 4,
    });

    for (const ct of coworkTodos) {
      contexts.push({
        sourceType: "coworkTodo",
        sourceId: ct.id,
        title: ct.title,
        description: ct.description,
        assigneeName: ct.assignedTo?.name,
        assigneeRole: ct.assignedTo?.role,
        dueDate: ct.date,
      });
    }

    // ── 4. Support tickets (new/open, no ready/accepted draft) ───────────
    const tickets = await prisma.supportTicket.findMany({
      where: {
        deleted: false,
        status: { in: ["new", "open"] },
        aiDrafts: { none: { status: { in: ["ready", "accepted"] } } },
      },
      include: {
        assignedTo: { select: { name: true, role: true } },
        service: { select: { name: true, code: true } },
      },
      orderBy: [{ createdAt: "asc" }],
      take: 3,
    });

    for (const tk of tickets) {
      contexts.push({
        sourceType: "ticket",
        sourceId: tk.id,
        title: tk.subject || `Ticket #${tk.ticketNumber}`,
        description: null,
        assigneeName: tk.assignedTo?.name,
        assigneeRole: tk.assignedTo?.role,
        serviceName: tk.service?.name,
        serviceCode: tk.service?.code,
        priority: tk.priority,
      });
    }

    // ── 5. Issues (open/in_discussion, no ready/accepted draft) ──────────
    const issues = await prisma.issue.findMany({
      where: {
        deleted: false,
        status: { in: ["open", "in_discussion"] },
        aiDrafts: { none: { status: { in: ["ready", "accepted"] } } },
      },
      include: {
        owner: { select: { name: true, role: true } },
        service: { select: { name: true, code: true } },
        rock: { select: { title: true } },
      },
      orderBy: [{ priority: "desc" }, { identifiedAt: "asc" }],
      take: 3,
    });

    for (const iss of issues) {
      contexts.push({
        sourceType: "issue",
        sourceId: iss.id,
        title: iss.title,
        description: iss.description,
        assigneeName: iss.owner?.name,
        assigneeRole: iss.owner?.role,
        serviceName: iss.service?.name,
        serviceCode: iss.service?.code,
        linkedRock: iss.rock?.title,
        priority: iss.priority,
      });
    }

    // ── Process each task ────────────────────────────────────────────────
    // Limit to 20 total
    const toProcess = contexts.slice(0, 20);
    let generated = 0;
    let failed = 0;

    for (const ctx of toProcess) {
      const result = await generateDraft(ctx);
      if (result) {
        await saveDraft(ctx, result.content, result.tokensUsed);
        generated++;
      } else {
        failed++;
      }
    }

    logger.info("AI task agent completed", {
      found: toProcess.length,
      generated,
      failed,
    });

    await guard.complete({ found: toProcess.length, generated, failed });

    return NextResponse.json({
      message: "AI task agent completed",
      found: toProcess.length,
      generated,
      failed,
    });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
