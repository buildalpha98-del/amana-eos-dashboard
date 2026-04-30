import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { logCoworkActivity } from "@/app/api/cowork/_lib/cowork-activity-log";

import { parseJsonBody } from "@/lib/api-error";
const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "in_review", "done"]).default("todo"),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  dueDate: z.string().datetime().optional(),
  assigneeId: z.string().optional(),
  assigneeEmail: z.string().email().optional(),
  campaignId: z.string().optional(),
  postId: z.string().optional(),
  serviceId: z.string().optional(),
  serviceCode: z.string().optional(),
});

const batchTaskSchema = z.object({
  tasks: z.array(createTaskSchema).min(1).max(50),
});

/**
 * POST /api/cowork/marketing/tasks — Create marketing task(s) via API key
 *
 * Accepts a single task or batch of tasks.
 * Auth: API key with "marketing-tasks:write" scope
 *
 * Body (single): { title, status, priority, ... }
 * Body (batch):  { tasks: [{ title, ... }, ...] }
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = (await parseJsonBody(req)) as Record<string, unknown>;
    const isBatch = Array.isArray(body.tasks);
    const tasksToCreate = isBatch
      ? batchTaskSchema.parse(body).tasks
      : [createTaskSchema.parse(body)];

    const results = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < tasksToCreate.length; i++) {
      const t = tasksToCreate[i];
      try {
        // Resolve assignee from email if provided
        let assigneeId = t.assigneeId;
        if (!assigneeId && t.assigneeEmail) {
          const user = await prisma.user.findUnique({
            where: { email: t.assigneeEmail },
            select: { id: true },
          });
          assigneeId = user?.id ?? undefined;
        }

        // Resolve service from code if provided
        let serviceId = t.serviceId;
        if (!serviceId && t.serviceCode) {
          const service = await prisma.service.findUnique({
            where: { code: t.serviceCode },
            select: { id: true },
          });
          serviceId = service?.id ?? undefined;
        }

        const task = await prisma.marketingTask.create({
          data: {
            title: t.title,
            description: t.description || null,
            status: t.status as any,
            priority: t.priority as any,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            assigneeId: assigneeId || null,
            campaignId: t.campaignId || null,
            postId: t.postId || null,
            serviceId: serviceId || null,
          },
          include: {
            assignee: { select: { id: true, name: true } },
            service: { select: { id: true, name: true, code: true } },
          },
        });

        results.push(task);
      } catch (err) {
        errors.push({
          index: i,
          error: err instanceof Error ? err.message : "Failed to create task",
        });
      }
    }

    logCoworkActivity({
      action: "api_import",
      entityType: "MarketingTask",
      entityId: results[0]?.id || "batch",
      details: {
        tasksCreated: results.length,
        tasksFailed: errors.length,
        via: "cowork_api",
        keyName: "Cowork Automation",
      },
    });

    return NextResponse.json({
      success: true,
      created: results.length,
      failed: errors.length,
      tasks: results,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.issues[0].message },
        { status: 400 },
      );
    }
    logger.error("Cowork Marketing Tasks", { err });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});

/**
 * GET /api/cowork/marketing/tasks — List tasks via API key
 * Auth: API key with "marketing-tasks:read" scope
 */
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const assigneeEmail = searchParams.get("assigneeEmail");
  const serviceCode = searchParams.get("serviceCode");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  let assigneeId: string | undefined;
  if (assigneeEmail) {
    const user = await prisma.user.findUnique({
      where: { email: assigneeEmail },
      select: { id: true },
    });
    assigneeId = user?.id;
  }

  let serviceId: string | undefined;
  if (serviceCode) {
    const service = await prisma.service.findUnique({
      where: { code: serviceCode },
      select: { id: true },
    });
    serviceId = service?.id;
  }

  const tasks = await prisma.marketingTask.findMany({
    where: {
      deleted: false,
      ...(status ? { status: status as any } : {}),
      ...(priority ? { priority: priority as any } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(serviceId ? { serviceId } : {}),
    },
    include: {
      assignee: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, code: true } },
      campaign: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: { sort: "asc", nulls: "last" } },
    take: limit,
  });

  return NextResponse.json({ tasks, count: tasks.length });
});
