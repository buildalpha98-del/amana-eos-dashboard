import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
const updateVacancySchema = z.object({
  role: z.string().min(1).optional(),
  employmentType: z.string().optional(),
  qualificationRequired: z.string().nullable().optional(),
  status: z.string().optional(),
  postedChannels: z.array(z.string()).optional(),
  postedAt: z.string().nullable().optional(),
  targetFillDate: z.string().nullable().optional(),
  filledAt: z.string().nullable().optional(),
  filledByUserId: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const GET = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const vacancy = await prisma.recruitmentVacancy.findUnique({
    where: { id },
    include: {
      service: { select: { id: true, name: true, code: true } },
      assignedTo: { select: { id: true, name: true } },
      filledByUser: { select: { id: true, name: true } },
      candidates: {
        orderBy: { createdAt: "desc" },
        include: {
          referredByUser: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!vacancy) {
    return NextResponse.json({ error: "Vacancy not found" }, { status: 404 });
  }

  return NextResponse.json(vacancy);
}, { roles: ["owner", "head_office", "admin"] });

export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateVacancySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    if (["postedAt", "targetFillDate", "filledAt"].includes(field) && value) {
      data[field] = new Date(value as string);
    } else {
      data[field] = value;
    }
  }

  if (parsed.data.status === "filled" && !data.filledAt) {
    data.filledAt = new Date();
  }

  const vacancy = await prisma.recruitmentVacancy.update({
    where: { id },
    data,
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json(vacancy);
}, { roles: ["owner", "head_office", "admin"] });

export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  await prisma.recruitmentVacancy.update({
    where: { id },
    data: { deleted: true },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });
