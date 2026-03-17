import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { z } from "zod";

const schema = z.object({
  campaignId: z.string().optional(),
  serviceId: z.string().optional(),
  startDate: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin", "marketing"]);
  if (error) return error;
  const { id } = await params;
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
}
