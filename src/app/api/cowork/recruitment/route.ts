import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
const postBodySchema = z.object({
  serviceId: z.string().min(1),
  role: z.string().min(1),
  employmentType: z.enum(["casual", "part_time", "permanent", "fixed_term"]),
  qualificationRequired: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * GET /api/cowork/recruitment — List open vacancies
 * Auth: API key with "recruitment:read" scope
 */
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  const where: Record<string, unknown> = { deleted: false, status: "open" };
  if (serviceId) where.serviceId = serviceId;

  const vacancies = await prisma.recruitmentVacancy.findMany({
    where,
    include: {
      service: { select: { id: true, name: true, code: true } },
      _count: { select: { candidates: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ vacancies });
});

/**
 * POST /api/cowork/recruitment — Create a vacancy
 * Auth: API key with "recruitment:write" scope
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await parseJsonBody(req);
    const parsed = postBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { serviceId, role, employmentType, qualificationRequired, notes } = parsed.data;

    const vacancy = await prisma.recruitmentVacancy.create({
      data: {
        serviceId,
        role,
        employmentType,
        qualificationRequired: qualificationRequired || null,
        notes: notes || null,
        postedChannels: [],
      },
      include: {
        service: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json(vacancy, { status: 201 });
  } catch (err) {
    logger.error("Cowork recruitment POST error", { err });
    return NextResponse.json({ error: "Failed to create vacancy" }, { status: 500 });
  }
});
