import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const createSchoolCommSchema = z.object({
  serviceId: z.string().min(1, "serviceId is required"),
  type: z.enum([
    "newsletter",
    "program_overview",
    "open_day",
    "holiday_quest",
    "end_of_term",
    "whatsapp",
    "custom",
  ]),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  schoolName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  termWeek: z.number().int().min(1).max(10).optional(),
});

const schoolCommIncludes = {
  service: { select: { id: true, name: true, code: true } },
  sentBy: { select: { id: true, name: true } },
} as const;

// GET /api/marketing/school-comms — list school comms with optional filters
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const serviceId = searchParams.get("serviceId");
  const termWeek = searchParams.get("termWeek");

  const comms = await prisma.schoolComm.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(serviceId ? { serviceId } : {}),
      ...(termWeek ? { termWeek: parseInt(termWeek, 10) } : {}),
    },
    include: schoolCommIncludes,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(comms);
}, { roles: ["owner", "head_office", "admin", "marketing"] });

// POST /api/marketing/school-comms — create a new school comm
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = createSchoolCommSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const comm = await prisma.schoolComm.create({
    data: {
      serviceId: parsed.data.serviceId,
      type: parsed.data.type,
      subject: parsed.data.subject,
      body: parsed.data.body,
      schoolName: parsed.data.schoolName || null,
      contactEmail: parsed.data.contactEmail || null,
      termWeek: parsed.data.termWeek || null,
    },
    include: schoolCommIncludes,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "SchoolComm",
      entityId: comm.id,
      details: { subject: comm.subject, type: comm.type },
    },
  });

  return NextResponse.json(comm, { status: 201 });
}, { roles: ["owner", "head_office", "admin", "marketing"] });
