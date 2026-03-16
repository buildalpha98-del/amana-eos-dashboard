import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

const VALID_TYPES = [
  "newsletter",
  "program_overview",
  "open_day",
  "holiday_quest",
  "end_of_term",
  "staff_memo",
  "term_letter",
  "custom",
];

/**
 * POST /api/cowork/services/[serviceCode]/comms
 * Create a school communication (newsletter, memo, term letter, etc.) in draft status.
 * Called by automation tasks (newsletter-*, staff-memo-*, term-letter-*, etc.).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serviceCode: string }> }
) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const { serviceCode } = await params;

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true, name: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: "Not Found", message: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const body = await req.json();
  const {
    type,
    subject,
    body: commBody,
    termWeek,
    schoolName,
    contactEmail,
  } = body;

  if (!type || !subject || !commBody) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: "type, subject, and body are required",
      },
      { status: 400 }
    );
  }

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: `type must be one of: ${VALID_TYPES.join(", ")}`,
      },
      { status: 400 }
    );
  }

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
}

/**
 * GET /api/cowork/services/[serviceCode]/comms?type=newsletter&limit=20
 * Fetch communications for a centre.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serviceCode: string }> }
) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const { serviceCode } = await params;

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: "Not Found", message: `Service ${serviceCode} not found` },
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
}
