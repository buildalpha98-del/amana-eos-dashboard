import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const createTemplateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Body is required"),
  category: z.string().optional().nullable(),
  shortcut: z.string().optional().nullable(),
});

// GET /api/response-templates — list all templates
export const GET = withApiAuth(async (req, session) => {
  const templates = await prisma.responseTemplate.findMany({
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });

  return NextResponse.json(templates);
});

// POST /api/response-templates — create a new template
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = createTemplateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const template = await prisma.responseTemplate.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      category: parsed.data.category || null,
      shortcut: parsed.data.shortcut || null,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "ResponseTemplate",
      entityId: template.id,
      details: { title: template.title, category: template.category },
    },
  });

  return NextResponse.json(template, { status: 201 });
});
