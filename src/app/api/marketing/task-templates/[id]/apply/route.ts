import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";

const schema = z.object({
  campaignId: z.string().optional(),
  serviceId: z.string().optional(),
  startDate: z.string().optional(),
});

export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = schema.parse(await req.json());

  const template = await prisma.marketingTaskTemplate.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const start = body.startDate ? new Date(body.startDate) : new Date();

  const tasks = await Promise.all(
    template.items.map((item) => {
      const dueDate = new Date(start);
      dueDate.setDate(dueDate.getDate() + item.daysOffset);
      return prisma.marketingTask.create({
        data: {
          title: item.title,
          description: item.description,
          priority: item.priority,
          status: "todo",
          dueDate,
          campaignId: body.campaignId || null,
          serviceId: body.serviceId || null,
        },
      });
    })
  );

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "applied_task_template",
      entityType: "MarketingTask",
      entityId: template.id,
      details: `Applied template "${template.name}" — created ${tasks.length} tasks`,
    },
  });

  return NextResponse.json({ created: tasks.length, tasks });
}, { roles: ["owner", "head_office", "admin", "marketing"] });
