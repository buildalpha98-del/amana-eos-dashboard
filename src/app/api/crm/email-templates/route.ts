import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasFeature, parseRole } from "@/lib/role-permissions";
import type { PipelineStage, LeadSource } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
const PIPELINE_STAGES: PipelineStage[] = [
  "new_lead", "reviewing", "contact_made", "follow_up_1", "follow_up_2",
  "meeting_booked", "proposal_sent", "submitted", "negotiating",
  "won", "lost", "on_hold",
];

const LEAD_SOURCES: LeadSource[] = ["tender", "direct"];

const createTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  triggerStage: z
    .enum([...PIPELINE_STAGES] as [string, ...string[]])
    .optional()
    .nullable(),
  pipeline: z
    .enum([...LEAD_SOURCES] as [string, ...string[]])
    .optional()
    .nullable(),
  sortOrder: z.number().default(0),
});

// GET /api/crm/email-templates
export const GET = withApiAuth(async (req, session) => {
  const role = parseRole(session!.user.role);
  if (!role || !hasFeature(role, "crm.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const templates = await prisma.crmEmailTemplate.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(templates);
});

// POST /api/crm/email-templates
export const POST = withApiAuth(async (req, session) => {
  const role = parseRole(session!.user.role);
  if (!role || !hasFeature(role, "crm.manage_templates")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await parseJsonBody(req);
  const parsed = createTemplateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const template = await prisma.crmEmailTemplate.create({
    data: {
      name: parsed.data.name,
      subject: parsed.data.subject,
      body: parsed.data.body,
      triggerStage: (parsed.data.triggerStage as PipelineStage) || null,
      pipeline: (parsed.data.pipeline as LeadSource) || null,
      sortOrder: parsed.data.sortOrder,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "CrmEmailTemplate",
      entityId: template.id,
      details: { name: template.name },
    },
  });

  return NextResponse.json(template, { status: 201 });
});
