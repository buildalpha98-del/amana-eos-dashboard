import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const createTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  category: z.string().optional(),
  tasks: z.array(z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    sortOrder: z.number().optional(),
    defaultDays: z.number().optional(),
  })).optional(),
});

// GET /api/project-templates
export const GET = withApiAuth(async (req, session) => {
  const templates = await prisma.projectTemplate.findMany({
    include: {
      tasks: { orderBy: { sortOrder: "asc" } },
      _count: { select: { projects: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(templates);
});

// POST /api/project-templates
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = createTemplateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const template = await prisma.projectTemplate.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      category: parsed.data.category || null,
      tasks: parsed.data.tasks
        ? {
            create: parsed.data.tasks.map((t, i) => ({
              title: t.title,
              description: t.description || null,
              category: t.category || null,
              sortOrder: t.sortOrder ?? i,
              defaultDays: t.defaultDays || null,
            })),
          }
        : undefined,
    },
    include: {
      tasks: { orderBy: { sortOrder: "asc" } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "ProjectTemplate",
      entityId: template.id,
      details: { name: template.name },
    },
  });

  return NextResponse.json(template, { status: 201 });
}, { roles: ["owner", "head_office", "admin"] });
