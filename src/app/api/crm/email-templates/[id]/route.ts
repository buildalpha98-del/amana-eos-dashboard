import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasFeature, parseRole } from "@/lib/role-permissions";
import type { PipelineStage, LeadSource } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";

const PIPELINE_STAGES: PipelineStage[] = [
  "new_lead", "reviewing", "contact_made", "follow_up_1", "follow_up_2",
  "meeting_booked", "proposal_sent", "submitted", "negotiating",
  "won", "lost", "on_hold",
];

const LEAD_SOURCES: LeadSource[] = ["tender", "direct"];

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  triggerStage: z
    .enum([...PIPELINE_STAGES] as [string, ...string[]])
    .optional()
    .nullable(),
  pipeline: z
    .enum([...LEAD_SOURCES] as [string, ...string[]])
    .optional()
    .nullable(),
  sortOrder: z.number().optional(),
});

// PUT /api/crm/email-templates/[id]
export const PUT = withApiAuth(async (req, session, context) => {
  const role = parseRole(session!.user.role);
  if (!role || !hasFeature(role, "crm.manage_templates")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context!.params!;
  const body = await req.json();
  const parsed = updateTemplateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const existing = await prisma.crmEmailTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const template = await prisma.crmEmailTemplate.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.subject !== undefined && { subject: parsed.data.subject }),
      ...(parsed.data.body !== undefined && { body: parsed.data.body }),
      ...(parsed.data.triggerStage !== undefined && {
        triggerStage: (parsed.data.triggerStage as PipelineStage) || null,
      }),
      ...(parsed.data.pipeline !== undefined && {
        pipeline: (parsed.data.pipeline as LeadSource) || null,
      }),
      ...(parsed.data.sortOrder !== undefined && {
        sortOrder: parsed.data.sortOrder,
      }),
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "CrmEmailTemplate",
      entityId: id,
      details: { name: template.name },
    },
  });

  return NextResponse.json(template);
});

// DELETE /api/crm/email-templates/[id]
export const DELETE = withApiAuth(async (req, session, context) => {
  const role = parseRole(session!.user.role);
  if (!role || !hasFeature(role, "crm.manage_templates")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context!.params!;

  const existing = await prisma.crmEmailTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  await prisma.crmEmailTemplate.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "CrmEmailTemplate",
      entityId: id,
      details: { name: existing.name },
    },
  });

  return NextResponse.json({ success: true });
});
