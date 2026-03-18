import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/sequences — list sequences with step count + active enrolment count
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

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
}

// POST /api/sequences — create sequence with steps
export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { name, type, triggerStage, steps } = body as {
    name: string;
    type: "parent_nurture" | "crm_outreach";
    triggerStage?: string;
    steps: Array<{
      name: string;
      delayHours: number;
      templateKey: string;
      emailTemplateId?: string;
    }>;
  };

  if (!name || !type || !steps?.length) {
    return NextResponse.json(
      { error: "name, type, and steps are required" },
      { status: 400 },
    );
  }

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
}
