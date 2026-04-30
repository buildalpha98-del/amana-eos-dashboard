import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
const createCandidateSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  source: z.string().min(1, "source is required"),
  notes: z.string().optional().nullable(),
  referredByUserId: z.string().optional().nullable(),
  resumeText: z.string().optional().nullable(),
  resumeFileUrl: z.string().optional().nullable(),
});

export const GET = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const candidates = await prisma.recruitmentCandidate.findMany({
    where: { vacancyId: id },
    include: {
      referredByUser: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(candidates);
}, { roles: ["owner", "head_office", "admin", "coordinator"] });

export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = createCandidateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, email, phone, source, notes, referredByUserId, resumeText, resumeFileUrl } = parsed.data;

  // Verify vacancy exists
  const vacancy = await prisma.recruitmentVacancy.findUnique({
    where: { id },
  });
  if (!vacancy) {
    return NextResponse.json({ error: "Vacancy not found" }, { status: 404 });
  }

  const candidate = await prisma.recruitmentCandidate.create({
    data: {
      vacancyId: id,
      name,
      email: email || null,
      phone: phone || null,
      source,
      notes: notes || null,
      resumeText: resumeText || null,
      resumeFileUrl: resumeFileUrl || null,
      referredByUserId: referredByUserId || null,
    },
  });

  return NextResponse.json(candidate, { status: 201 });
}, { feature: "recruitment.candidates.manage" });
