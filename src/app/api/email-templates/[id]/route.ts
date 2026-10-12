import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { emailBlocksSchema } from "@/lib/email-block-schema";

const CATEGORIES = ["welcome", "newsletter", "event", "announcement", "enrolment", "nurture", "custom"] as const;
const AUDIENCES = ["parents", "staff", "both"] as const;


const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z
    .enum(CATEGORIES)
    .optional(),
  subject: z.string().min(1).max(500).optional(),
  htmlContent: z.string().optional().nullable(),
  blocks: emailBlocksSchema.optional().nullable(),
  audience: z.enum(AUDIENCES).optional(),
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

  const body = await parseJsonBody(req);
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

  // A nurture/sequence step pointing at it would silently lose its email.
  const inUse = await prisma.sequenceStep.count({ where: { emailTemplateId: id } });
  if (inUse > 0) {
    return NextResponse.json(
      { error: `This template is used by ${inUse} automated sequence step${inUse === 1 ? "" : "s"}. Change those first.` },
      { status: 409 },
    );
  }

  await prisma.emailTemplate.delete({ where: { id } });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin", "marketing"] });
