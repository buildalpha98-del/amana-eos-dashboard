import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { resolveCoordinatorForService } from "@/lib/whatsapp-compliance";
import { sendAssignmentEmail } from "@/lib/send-assignment-email";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const back = (day + 6) % 7; // Mon = 0
  return new Date(d.getTime() - back * DAY_MS);
}

const createSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  serviceIds: z.array(z.string().min(1)).min(1, "Pick at least one centre").max(15),
  dueDate: z.string().refine((d) => !Number.isNaN(Date.parse(d)), { message: "Invalid dueDate" }),
  /** Optional fallback assignee when a service has no coordinator (e.g. service manager). */
  fallbackAssigneeId: z.string().optional(),
  /** Optional context — appended to description as "Re: {Campaign name} ({Centre})". */
  activationId: z.string().optional(),
  campaignId: z.string().optional(),
});

interface CreatedRow {
  todoId: string;
  serviceId: string;
  serviceName: string;
  assigneeId: string;
  assigneeName: string;
}

interface SkippedRow {
  serviceId: string;
  serviceName: string | null;
  reason: string;
}

const querySchema = z.object({
  serviceId: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed", "blocked"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = withApiAuth(
  async (req, session) => {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten());

    const where: Record<string, unknown> = {
      createdById: session.user.id,
      serviceId: { not: null },
      deleted: false,
    };
    if (parsed.data.serviceId) where.serviceId = parsed.data.serviceId;
    if (parsed.data.status) where.status = parsed.data.status;

    const todos = await prisma.todo.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      include: {
        assignee: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, code: true } },
      },
      take: parsed.data.limit ?? 100,
    });

    return NextResponse.json({
      todos: todos.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        dueDate: t.dueDate.toISOString(),
        completedAt: t.completedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        assignee: t.assignee,
        service: t.service,
      })),
    });
  },
  { roles: ["marketing", "owner"] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    // Validate services + load context.
    const services = await prisma.service.findMany({
      where: { id: { in: parsed.data.serviceIds } },
      select: { id: true, name: true, managerId: true },
    });
    if (services.length !== parsed.data.serviceIds.length) {
      throw ApiError.badRequest("One or more serviceIds are invalid");
    }

    let activationContext: { campaignName: string; serviceId: string } | null = null;
    if (parsed.data.activationId) {
      const act = await prisma.campaignActivationAssignment.findUnique({
        where: { id: parsed.data.activationId },
        select: { id: true, serviceId: true, campaign: { select: { name: true } } },
      });
      if (!act) throw ApiError.badRequest("activationId not found");
      activationContext = { campaignName: act.campaign.name, serviceId: act.serviceId };
    } else if (parsed.data.campaignId) {
      const camp = await prisma.marketingCampaign.findUnique({
        where: { id: parsed.data.campaignId },
        select: { id: true, name: true },
      });
      if (!camp) throw ApiError.badRequest("campaignId not found");
      activationContext = { campaignName: camp.name, serviceId: services[0].id };
    }

    const dueDate = new Date(parsed.data.dueDate);
    const weekOf = startOfWeek(dueDate);

    const created: CreatedRow[] = [];
    const skipped: SkippedRow[] = [];

    for (const svc of services) {
      const coord = await resolveCoordinatorForService(svc.id);
      const assigneeId = coord?.id ?? svc.managerId ?? parsed.data.fallbackAssigneeId ?? null;
      const assigneeName = coord?.name ?? null;

      if (!assigneeId) {
        skipped.push({
          serviceId: svc.id,
          serviceName: svc.name,
          reason: "No coordinator, manager, or fallback assignee for this centre",
        });
        continue;
      }

      const contextLine = activationContext
        ? `\n\n— Marketing context: ${activationContext.campaignName}`
        : "";
      const description = (parsed.data.description ?? "") + contextLine;

      const todo = await prisma.todo.create({
        data: {
          title: parsed.data.title,
          description: description.trim() || null,
          assigneeId,
          createdById: session.user.id,
          serviceId: svc.id,
          dueDate,
          weekOf,
        },
        include: {
          assignee: { select: { id: true, name: true } },
        },
      });

      await prisma.activityLog.create({
        data: {
          userId: session.user.id,
          action: "create",
          entityType: "Todo",
          entityId: todo.id,
          details: {
            title: todo.title,
            source: "marketing-coordinator-todo",
            serviceId: svc.id,
            activationId: parsed.data.activationId ?? null,
            campaignId: parsed.data.campaignId ?? null,
          },
        },
      });

      // Fire-and-forget assignee notification (helper catches internally).
      if (assigneeId !== session.user.id) {
        sendAssignmentEmail({
          type: "todo",
          assigneeId,
          assignerId: session.user.id,
          entityTitle: todo.title,
        });
      }

      created.push({
        todoId: todo.id,
        serviceId: svc.id,
        serviceName: svc.name,
        assigneeId,
        assigneeName: todo.assignee?.name ?? assigneeName ?? "Unknown",
      });
    }

    return NextResponse.json({ created, skipped }, { status: 201 });
  },
  { roles: ["marketing", "owner"] },
);
