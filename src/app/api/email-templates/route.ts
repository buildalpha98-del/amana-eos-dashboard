import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
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

const createSchema = z.object({
  name: z.string().min(1).max(200),
  category: z
    .enum(["welcome", "newsletter", "event", "announcement", "custom"])
    .default("custom"),
  subject: z.string().min(1).max(500),
  htmlContent: z.string().optional().nullable(),
  blocks: z.array(blockSchema).optional().nullable(),
  isDefault: z.boolean().optional(),
});

const templateInclude = {
  createdBy: { select: { id: true, name: true } },
} as const;

// GET /api/email-templates — list templates with optional ?category= filter
export const GET = withApiAuth(async (req, session) => {
  const category = new URL(req.url).searchParams.get("category");

  const templates = await prisma.emailTemplate.findMany({
    where: category
      ? { category: category as "welcome" | "newsletter" | "event" | "announcement" | "custom" }
      : undefined,
    include: templateInclude,
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(templates);
});

// POST /api/email-templates — create a new template
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { isDefault, blocks, ...data } = parsed.data;

  // If setting as default, unset existing defaults for this category
  if (isDefault) {
    await prisma.emailTemplate.updateMany({
      where: { category: data.category, isDefault: true },
      data: { isDefault: false },
    });
  }

  const template = await prisma.emailTemplate.create({
    data: {
      ...data,
      blocks: blocks === null ? Prisma.DbNull : blocks ?? undefined,
      isDefault: isDefault ?? false,
      createdById: session!.user.id,
    },
    include: templateInclude,
  });

  return NextResponse.json(template, { status: 201 });
});
