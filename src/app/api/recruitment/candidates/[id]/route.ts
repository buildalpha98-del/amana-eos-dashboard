import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

const updateCandidateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  source: z.string().optional(),
  stage: z.string().optional(),
  interviewNotes: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  referredByUserId: z.string().nullable().optional(),
});

export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await req.json();
  const parsed = updateCandidateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    data[field] = value;
  }

  // Auto-update stageChangedAt when stage changes
  if (parsed.data.stage !== undefined) {
    data.stageChangedAt = new Date();
  }

  const candidate = await prisma.recruitmentCandidate.update({
    where: { id },
    data,
    include: {
      vacancy: {
        select: { id: true, role: true, service: { select: { name: true } } },
      },
    },
  });

  return NextResponse.json(candidate);
}, { roles: ["owner", "head_office", "admin"] });
