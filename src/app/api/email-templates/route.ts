import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { emailBlocksSchema } from "@/lib/email-block-schema";

const CATEGORIES = ["welcome", "newsletter", "event", "announcement", "enrolment", "nurture", "custom"] as const;
const AUDIENCES = ["parents", "staff", "both"] as const;


const createSchema = z.object({
  name: z.string().min(1).max(200),
  category: z
    .enum(CATEGORIES)
    .default("custom"),
  subject: z.string().min(1).max(500),
  htmlContent: z.string().optional().nullable(),
  blocks: emailBlocksSchema.optional().nullable(),
  audience: z.enum(AUDIENCES).optional(),
  isDefault: z.boolean().optional(),
});

const templateInclude = {
  createdBy: { select: { id: true, name: true } },
} as const;

// GET /api/email-templates — list templates. Optional ?category= filter and
// ?audience=staff|parents, which also includes templates marked "both".
export const GET = withApiAuth(async (req) => {
  const params = new URL(req.url).searchParams;
  const category = params.get("category");
  const audience = params.get("audience");
  const where: Prisma.EmailTemplateWhereInput = {};
  if (category && (CATEGORIES as readonly string[]).includes(category)) {
    where.category = category as (typeof CATEGORIES)[number];
  }
  if (audience === "staff" || audience === "parents") where.audience = { in: [audience, "both"] };

  const templates = await prisma.emailTemplate.findMany({
    where,
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
}, { roles: ["owner", "head_office", "admin", "marketing"] });
