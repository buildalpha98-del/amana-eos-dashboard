import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
const blockSchema = z.object({
  type: z.enum(["heading", "text", "image", "button", "divider", "spacer"]),
  text: z.string().optional(),
  level: z.enum(["h1", "h2", "h3"]).optional(),
  content: z.string().optional(),
  url: z.string().optional(),
  alt: z.string().optional(),
  linkUrl: z.string().optional(),
  label: z.string().optional(),
  color: z.string().optional(),
  height: z.number().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z
    .enum(["welcome", "newsletter", "event", "announcement", "custom"])
    .optional(),
  subject: z.string().min(1).max(500).optional(),
  htmlContent: z.string().optional().nullable(),
  blocks: z.array(blockSchema).optional().nullable(),
  isDefault: z.boolean().optional(),
});

const templateInclude = {
  createdBy: { select: { id: true, name: true } },
} as const;

// GET /api/email-templates/:id
export const GET = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const template = await prisma.emailTemplate.findUnique({
    where: { id },
    include: templateInclude,
  });

  if (!template) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(template);
});

// PATCH /api/email-templates/:id
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const existing = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 },
    );
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { isDefault, blocks, ...data } = parsed.data;

  // If setting as default, unset existing defaults for the category
  if (isDefault) {
    const category = data.category ?? existing.category;
    await prisma.emailTemplate.updateMany({
      where: { category, isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const template = await prisma.emailTemplate.update({
    where: { id },
    data: {
      ...data,
      ...(isDefault !== undefined ? { isDefault } : {}),
      ...(blocks !== undefined
        ? { blocks: blocks === null ? Prisma.DbNull : blocks }
        : {}),
    },
    include: templateInclude,
  });

  return NextResponse.json(template);
}, { roles: ["owner", "head_office", "admin", "marketing"] });

// DELETE /api/email-templates/:id
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const existing = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 },
    );
  }

  await prisma.emailTemplate.delete({ where: { id } });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin", "marketing"] });
