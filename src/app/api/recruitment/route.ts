import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
const createVacancySchema = z.object({
  serviceId: z.string().min(1, "serviceId is required"),
  role: z.string().min(1, "role is required"),
  employmentType: z.enum(["casual", "part_time", "permanent", "fixed_term"]),
  qualificationRequired: z.string().optional().nullable(),
  postedChannels: z.array(z.string()).optional(),
  targetFillDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

export const GET = withApiAuth(async (req, session) => {
const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const status = searchParams.get("status");
  const role = searchParams.get("role");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  const where: Record<string, unknown> = { deleted: false };
  if (serviceId) where.serviceId = serviceId;
  if (status) where.status = status;
  if (role) where.role = role;

  const [vacancies, total] = await Promise.all([
    prisma.recruitmentVacancy.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, code: true } },
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { candidates: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.recruitmentVacancy.count({ where }),
  ]);

  return NextResponse.json({ vacancies, total, page, limit });
}, { roles: ["owner", "head_office", "admin", "member"] });

export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = createVacancySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { serviceId, role, employmentType, qualificationRequired, postedChannels, targetFillDate, notes, assignedToId } = parsed.data;

  const vacancy = await prisma.recruitmentVacancy.create({
    data: {
      serviceId,
      role,
      employmentType,
      qualificationRequired: qualificationRequired || null,
      postedChannels: postedChannels || [],
      targetFillDate: targetFillDate ? new Date(targetFillDate) : null,
      notes: notes || null,
      assignedToId: assignedToId || null,
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json(vacancy, { status: 201 });
}, { feature: "recruitment.edit" });
