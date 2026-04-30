import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  serviceId: z.string().min(1),
  coordinatorName: z.string().nullable().optional(),
});

const DAY_MS = 24 * 60 * 60 * 1000;

function nextMonday(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(9, 0, 0, 0);
  const day = d.getUTCDay();
  const offset = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  return new Date(d.getTime() + offset * DAY_MS);
}

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const service = await prisma.service.findUnique({
      where: { id: parsed.data.serviceId },
      select: { id: true, name: true },
    });
    if (!service) throw ApiError.notFound("Service not found");

    const coordName = parsed.data.coordinatorName?.trim() || "the coordinator";
    const task = await prisma.marketingTask.create({
      data: {
        title: `Discuss WhatsApp compliance with ${coordName} (${service.name})`,
        description: `Two consecutive weeks below the 4/5 weekday floor at ${service.name}. Discuss support needed in next 1:1.`,
        status: "todo",
        priority: "high",
        dueDate: nextMonday(),
        serviceId: service.id,
        assigneeId: session.user.id,
      },
    });

    return NextResponse.json({ taskId: task.id, dueDate: task.dueDate?.toISOString() ?? null }, { status: 201 });
  },
  { roles: ["marketing", "owner"] },
);
