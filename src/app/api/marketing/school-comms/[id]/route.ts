import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const updateSchoolCommSchema = z.object({
  type: z
    .enum([
      "newsletter",
      "program_overview",
      "open_day",
      "holiday_quest",
      "end_of_term",
      "whatsapp",
      "custom",
    ])
    .optional(),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  schoolName: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  status: z.enum(["draft", "sent", "scheduled"]).optional(),
  termWeek: z.number().int().min(1).max(10).nullable().optional(),
});

const schoolCommIncludes = {
  service: { select: { id: true, name: true, code: true } },
  sentBy: { select: { id: true, name: true } },
} as const;

// GET /api/marketing/school-comms/[id] — get a single school comm
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const comm = await prisma.schoolComm.findUnique({
    where: { id },
    include: schoolCommIncludes,
  });

  if (!comm) {
    return NextResponse.json(
      { error: "School comm not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(comm);
}, { roles: ["owner", "head_office", "admin", "marketing"] });

// PATCH /api/marketing/school-comms/[id] — update a school comm
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const existing = await prisma.schoolComm.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "School comm not found" },
      { status: 404 },
    );
  }

  const body = await parseJsonBody(req);
  const parsed = updateSchoolCommSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  // Build the update data
  const updateData: Record<string, unknown> = {};

  if (parsed.data.type !== undefined) updateData.type = parsed.data.type;
  if (parsed.data.subject !== undefined)
    updateData.subject = parsed.data.subject;
  if (parsed.data.body !== undefined) updateData.body = parsed.data.body;
  if (parsed.data.schoolName !== undefined)
    updateData.schoolName = parsed.data.schoolName;
  if (parsed.data.contactEmail !== undefined)
    updateData.contactEmail = parsed.data.contactEmail;
  if (parsed.data.termWeek !== undefined)
    updateData.termWeek = parsed.data.termWeek;

  // Handle status change — auto-set sentAt and sentById when marking as "sent"
  if (parsed.data.status !== undefined) {
    updateData.status = parsed.data.status;

    if (
      parsed.data.status === "sent" &&
      existing.status !== "sent"
    ) {
      updateData.sentAt = new Date();
      updateData.sentById = session!.user.id;
    }
  }

  const comm = await prisma.schoolComm.update({
    where: { id },
    data: updateData,
    include: schoolCommIncludes,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "SchoolComm",
      entityId: comm.id,
      details: { fields: Object.keys(parsed.data) },
    },
  });

  return NextResponse.json(comm);
}, { roles: ["owner", "head_office", "admin", "marketing"] });

// DELETE /api/marketing/school-comms/[id] — delete a school comm
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const existing = await prisma.schoolComm.findUnique({
    where: { id },
    select: { id: true, subject: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "School comm not found" },
      { status: 404 },
    );
  }

  await prisma.schoolComm.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "SchoolComm",
      entityId: id,
      details: { subject: existing.subject },
    },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin", "marketing"] });
