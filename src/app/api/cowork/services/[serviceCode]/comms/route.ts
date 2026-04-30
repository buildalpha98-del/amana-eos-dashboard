import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";

import { parseJsonBody } from "@/lib/api-error";
const VALID_TYPES = [
  "newsletter",
  "program_overview",
  "open_day",
  "holiday_quest",
  "end_of_term",
  "staff_memo",
  "term_letter",
  "custom",
] as const;

const postBodySchema = z.object({
  type: z.enum(VALID_TYPES),
  subject: z.string().min(1),
  body: z.string().min(1),
  termWeek: z.number().nullable().optional(),
  schoolName: z.string().optional(),
  contactEmail: z.string().nullable().optional(),
});

/**
 * POST /api/cowork/services/[serviceCode]/comms
 * Create a school communication (newsletter, memo, term letter, etc.) in draft status.
 * Called by automation tasks (newsletter-*, staff-memo-*, term-letter-*, etc.).
 */
export const POST = withApiHandler(async (req, context) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { serviceCode } = await context!.params!;

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true, name: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const reqBody = await parseJsonBody(req);
  const parsed = postBodySchema.safeParse(reqBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const {
    type,
    subject,
    body: commBody,
    termWeek,
    schoolName,
    contactEmail,
  } = parsed.data;

  const comm = await prisma.schoolComm.create({
    data: {
      serviceId: service.id,
      type,
      subject,
      body: commBody,
      status: "draft",
      termWeek: termWeek || null,
      schoolName: schoolName || service.name,
      contactEmail: contactEmail || null,
    },
  });

  return NextResponse.json(
    {
      message: "Communication created",
      commId: comm.id,
      serviceCode,
      type,
      subject,
      status: "draft",
    },
    { status: 201 }
  );
});

/**
 * GET /api/cowork/services/[serviceCode]/comms?type=newsletter&limit=20
 * Fetch communications for a centre.
 */
export const GET = withApiHandler(async (req, context) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { serviceCode } = await context!.params!;

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

  const where: Record<string, unknown> = { serviceId: service.id };
  if (type) where.type = type;

  const comms = await prisma.schoolComm.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ comms });
});
