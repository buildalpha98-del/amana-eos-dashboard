import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
/**
 * 2026-09-15: an ad is now either site-specific (serviceId) or REGIONAL
 * (region) — casual-pool ads read "Eastern Melbourne, across multiple
 * schools", and requiring a single centre made those impossible to post.
 * At least one must be given, or the public listing has no location to show.
 */
const createVacancySchema = z.object({
  serviceId: z.string().min(1).optional().nullable(),
  region: z.string().max(120).optional().nullable(),
  role: z.string().min(1, "role is required"),
  employmentType: z.enum(["casual", "part_time", "permanent", "fixed_term"]),
  qualificationRequired: z.string().optional().nullable(),
  postedChannels: z.array(z.string()).optional(),
  targetFillDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  // Optional link to a Position Description — the interviewer sees
  // the PD inline on the vacancy detail surface when set.
  positionDescriptionId: z.string().optional().nullable(),
}).refine((v) => Boolean(v.serviceId) || Boolean(v.region?.trim()), {
  message: "Give the ad a centre or a region — the public listing needs a location",
  path: ["region"],
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

  const {
    serviceId,
    region,
    role,
    employmentType,
    qualificationRequired,
    postedChannels,
    targetFillDate,
    notes,
    assignedToId,
    positionDescriptionId,
  } = parsed.data;

  const vacancy = await prisma.recruitmentVacancy.create({
    data: {
      serviceId: serviceId || null,
      region: region?.trim() || null,
      role,
      employmentType,
      qualificationRequired: qualificationRequired || null,
      postedChannels: postedChannels || [],
      targetFillDate: targetFillDate ? new Date(targetFillDate) : null,
      notes: notes || null,
      assignedToId: assignedToId || null,
      positionDescriptionId: positionDescriptionId || null,
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
      positionDescription: { select: { id: true, title: true, targetRole: true } },
    },
  });

  return NextResponse.json(vacancy, { status: 201 });
}, { feature: "recruitment.edit" });
