import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/role-permissions";
import type { Role, PipelineStage, LeadSource } from "@prisma/client";
import { handleLeadWon } from "@/lib/crm/handle-lead-won";
import { scheduleCrmSequence } from "@/lib/crm/schedule-sequence";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

const PIPELINE_STAGES: PipelineStage[] = [
  "new_lead", "reviewing", "contact_made", "follow_up_1", "follow_up_2",
  "meeting_booked", "proposal_sent", "submitted", "negotiating",
  "won", "lost", "on_hold",
];

const LEAD_SOURCES: LeadSource[] = ["tender", "direct"];

const updateLeadSchema = z.object({
  schoolName: z.string().min(1).optional(),
  contactName: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable().or(z.literal("")),
  contactPhone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  suburb: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  source: z.enum([...LEAD_SOURCES] as [string, ...string[]]).optional(),
  pipelineStage: z
    .enum([...PIPELINE_STAGES] as [string, ...string[]])
    .optional(),
  tenderRef: z.string().optional().nullable(),
  tenderCloseDate: z.string().datetime().optional().nullable(),
  tenderUrl: z.string().url().optional().nullable().or(z.literal("")),
  estimatedCapacity: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  lostReason: z.string().optional().nullable(),
});

// GET /api/crm/leads/[id]
export const GET = withApiAuth(async (req, session, context) => {
if (!hasFeature(session!.user.role as Role, "crm.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context!.params!;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true, avatar: true } },
      service: { select: { id: true, name: true, code: true } },
      touchpoints: {
        orderBy: { sentAt: "desc" },
        take: 20,
        include: {
          sentBy: { select: { id: true, name: true, avatar: true } },
        },
      },
    },
  });

  if (!lead || lead.deleted) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json(lead);
});

// PUT /api/crm/leads/[id]
export const PUT = withApiAuth(async (req, session, context) => {
if (!hasFeature(session!.user.role as Role, "crm.edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context!.params!;
  const body = await req.json();
  const parsed = updateLeadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const existing = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, pipelineStage: true, schoolName: true, deleted: true },
  });

  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  // Copy simple fields
  for (const [key, value] of Object.entries(parsed.data)) {
    if (key === "pipelineStage") continue; // handled separately below
    if (key === "tenderCloseDate" && value) {
      data[key] = new Date(value as string);
    } else {
      data[key] = value === "" ? null : value;
    }
  }

  // Handle pipeline stage change
  const newStage = parsed.data.pipelineStage as PipelineStage | undefined;
  if (newStage && newStage !== existing.pipelineStage) {
    data.pipelineStage = newStage;
    data.stageChangedAt = new Date();

    if (newStage === "lost") {
      data.lostAt = new Date();
    }

    // Log stage change as a touchpoint
    await prisma.touchpointLog.create({
      data: {
        leadId: id,
        type: "stage_change",
        subject: `Stage changed: ${existing.pipelineStage} → ${newStage}`,
        sentById: session!.user.id,
      },
    });

    // Trigger CRM sequences for this stage (fire and forget)
    scheduleCrmSequence(id, newStage).catch(() => {});
  }

  const updated = await prisma.lead.update({
    where: { id },
    data,
    include: {
      assignedTo: { select: { id: true, name: true, email: true, avatar: true } },
      service: { select: { id: true, name: true, code: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "Lead",
      entityId: id,
      details: {
        schoolName: updated.schoolName,
        changes: Object.keys(parsed.data),
        ...(newStage ? { stageChange: `${existing.pipelineStage} → ${newStage}` } : {}),
      },
    },
  });

  // Handle won automation AFTER the update is saved
  if (newStage === "won") {
    try {
      const result = await handleLeadWon(id, session!.user.id);
      return NextResponse.json({ ...updated, wonResult: result });
    } catch (err) {
      logger.error("handleLeadWon error", { err });
      // Still return the updated lead even if automation fails
      return NextResponse.json({
        ...updated,
        wonResult: { error: "Auto-setup partially failed. Check logs." },
      });
    }
  }

  return NextResponse.json(updated);
});

// DELETE /api/crm/leads/[id]
export const DELETE = withApiAuth(async (req, session, context) => {
if (!hasFeature(session!.user.role as Role, "crm.edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context!.params!;

  const existing = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, schoolName: true, deleted: true },
  });

  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  await prisma.lead.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "Lead",
      entityId: id,
      details: { schoolName: existing.schoolName },
    },
  });

  return NextResponse.json({ success: true });
});
