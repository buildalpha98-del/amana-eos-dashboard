import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

const LIMIT = 50;

/**
 * GET /api/ai-drafts/admin
 *
 * Admin-scoped listing of AI drafts across the whole org. Unlike the user-scoped
 * `/api/ai-drafts` route, this returns drafts for every assignee. Supports
 * filtering by status (default "ready"), taskType and sourceType, plus pagination.
 *
 * Only owner / head_office / admin roles may access.
 */
export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") ?? "ready"; // default "ready"
    const taskType = searchParams.get("taskType");
    const sourceType = searchParams.get("sourceType"); // "todo" | "marketingTask" | "coworkTodo" | "ticket" | "issue"

    const pageRaw = Number(searchParams.get("page") ?? "1");
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

    const where: Record<string, unknown> = {};
    if (statusParam && statusParam !== "all") where.status = statusParam;
    if (taskType) where.taskType = taskType;
    if (sourceType === "todo") where.todoId = { not: null };
    else if (sourceType === "marketingTask") where.marketingTaskId = { not: null };
    else if (sourceType === "coworkTodo") where.coworkTodoId = { not: null };
    else if (sourceType === "ticket") where.ticketId = { not: null };
    else if (sourceType === "issue") where.issueId = { not: null };

    const [drafts, total] = await Promise.all([
      prisma.aiTaskDraft.findMany({
        where,
        include: {
          todo: {
            select: {
              id: true,
              title: true,
              assignee: { select: { id: true, name: true } },
            },
          },
          marketingTask: {
            select: {
              id: true,
              title: true,
              assignee: { select: { id: true, name: true } },
            },
          },
          coworkTodo: {
            select: {
              id: true,
              title: true,
              assignedTo: { select: { id: true, name: true } },
            },
          },
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              subject: true,
              assignedTo: { select: { id: true, name: true } },
            },
          },
          issue: {
            select: {
              id: true,
              title: true,
              owner: { select: { id: true, name: true } },
            },
          },
          reviewedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * LIMIT,
        take: LIMIT,
      }),
      prisma.aiTaskDraft.count({ where }),
    ]);

    return NextResponse.json({
      drafts,
      page,
      limit: LIMIT,
      total,
      totalPages: Math.max(1, Math.ceil(total / LIMIT)),
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
