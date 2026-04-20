import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const postSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["parent_nurture", "crm_outreach"]),
  triggerStage: z.string().optional(),
  steps: z.array(z.object({
    name: z.string().min(1),
    delayHours: z.number(),
    templateKey: z.string().min(1),
    emailTemplateId: z.string().optional(),
  })).min(1),
});
// GET /api/sequences — list sequences with step count + active enrolment count
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || undefined;

  const where = type ? { type: type as "parent_nurture" | "crm_outreach" } : {};

  const sequences = await prisma.sequence.findMany({
    where,
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      _count: {
        select: {
          enrolments: { where: { status: "active" } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ sequences });
});

// POST /api/sequences — create sequence with steps
export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { name, type, triggerStage, steps } = parsed.data;

  const sequence = await prisma.sequence.create({
    data: {
      name,
      type,
      triggerStage: triggerStage || null,
      steps: {
        create: steps.map((s, i) => ({
          stepNumber: i + 1,
          name: s.name,
          delayHours: s.delayHours,
          templateKey: s.templateKey,
          emailTemplateId: s.emailTemplateId || null,
        })),
      },
    },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      _count: {
        select: {
          enrolments: { where: { status: "active" } },
        },
      },
    },
  });

  return NextResponse.json(sequence, { status: 201 });
});
