import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasFeature, parseRole } from "@/lib/role-permissions";
import type { TouchpointType } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";

const TOUCHPOINT_TYPES: TouchpointType[] = [
  "email_sent", "call", "meeting", "note", "stage_change", "auto_email",
];

const createTouchpointSchema = z.object({
  type: z.enum([...TOUCHPOINT_TYPES] as [string, ...string[]]),
  subject: z.string().optional(),
  body: z.string().optional(),
});

// GET /api/crm/leads/[id]/touchpoints
export const GET = withApiAuth(async (req, session, context) => {
  const role = parseRole(session!.user.role);
  if (!role || !hasFeature(role, "crm.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context!.params!;

  const touchpoints = await prisma.touchpointLog.findMany({
    where: { leadId: id },
    include: {
      sentBy: { select: { id: true, name: true, avatar: true } },
    },
    orderBy: { sentAt: "desc" },
  });

  return NextResponse.json(touchpoints);
});

// POST /api/crm/leads/[id]/touchpoints
export const POST = withApiAuth(async (req, session, context) => {
  const role = parseRole(session!.user.role);
  if (!role || !hasFeature(role, "crm.create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context!.params!;
  const body = await req.json();
  const parsed = createTouchpointSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  // Verify lead exists
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, deleted: true },
  });

  if (!lead || lead.deleted) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const touchpoint = await prisma.touchpointLog.create({
    data: {
      leadId: id,
      type: parsed.data.type as TouchpointType,
      subject: parsed.data.subject || null,
      body: parsed.data.body || null,
      sentById: session!.user.id,
    },
    include: {
      sentBy: { select: { id: true, name: true, avatar: true } },
    },
  });

  return NextResponse.json(touchpoint, { status: 201 });
});
