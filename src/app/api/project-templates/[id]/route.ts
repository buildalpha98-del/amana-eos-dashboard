import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
});

// GET /api/project-templates/[id]
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const template = await prisma.projectTemplate.findUnique({
    where: { id },
    include: {
      tasks: { orderBy: { sortOrder: "asc" } },
      _count: { select: { projects: true } },
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json(template);
});

// PATCH /api/project-templates/[id]
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await req.json();
  const parsed = updateTemplateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.category !== undefined) data.category = parsed.data.category;

  const template = await prisma.projectTemplate.update({
    where: { id },
    data,
    include: {
      tasks: { orderBy: { sortOrder: "asc" } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "ProjectTemplate",
      entityId: template.id,
      details: { changes: Object.keys(data) },
    },
  });

  return NextResponse.json(template);
}, { roles: ["owner", "head_office", "admin"] });

// DELETE /api/project-templates/[id]
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  await prisma.projectTemplate.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "ProjectTemplate",
      entityId: id,
      details: {},
    },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });
