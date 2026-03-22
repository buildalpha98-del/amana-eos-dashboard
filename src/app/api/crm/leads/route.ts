import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/role-permissions";
import { parsePagination } from "@/lib/pagination";
import type { Role, PipelineStage, LeadSource } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";

const PIPELINE_STAGES: PipelineStage[] = [
  "new_lead", "reviewing", "contact_made", "follow_up_1", "follow_up_2",
  "meeting_booked", "proposal_sent", "submitted", "negotiating",
  "won", "lost", "on_hold",
];

const LEAD_SOURCES: LeadSource[] = ["tender", "direct"];

const createLeadSchema = z.object({
  schoolName: z.string().min(1, "School name is required"),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  suburb: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  source: z.enum([...LEAD_SOURCES] as [string, ...string[]]).default("direct"),
  tenderRef: z.string().optional(),
  tenderCloseDate: z.string().datetime().optional(),
  tenderUrl: z.string().url().optional().or(z.literal("")),
  estimatedCapacity: z.number().optional(),
  notes: z.string().optional(),
  assignedToId: z.string().optional(),
});

// GET /api/crm/leads
export const GET = withApiAuth(async (req, session) => {
if (!hasFeature(session!.user.role as Role, "crm.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage");
  const source = searchParams.get("source");
  const state = searchParams.get("state");
  const assigneeId = searchParams.get("assigneeId");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = { deleted: false };
  if (stage) where.pipelineStage = stage;
  if (source) where.source = source;
  if (state) where.state = state;
  if (assigneeId) where.assignedToId = assigneeId;
  if (search) {
    where.schoolName = { contains: search, mode: "insensitive" };
  }

  const include = {
    assignedTo: { select: { id: true, name: true, email: true, avatar: true } },
    service: { select: { id: true, name: true, code: true } },
    _count: { select: { touchpoints: true } },
  };
  const orderBy = { stageChangedAt: "desc" as const };

  const pagination = parsePagination(searchParams);

  if (pagination) {
    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include,
        orderBy,
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.lead.count({ where }),
    ]);
    return NextResponse.json({
      leads,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    });
  }

  // Backward-compatible: no pagination params → return flat array
  const leads = await prisma.lead.findMany({ where, include, orderBy });
  return NextResponse.json(leads);
});

// POST /api/crm/leads
export const POST = withApiAuth(async (req, session) => {
if (!hasFeature(session!.user.role as Role, "crm.create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createLeadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const lead = await prisma.lead.create({
    data: {
      schoolName: parsed.data.schoolName,
      contactName: parsed.data.contactName || null,
      contactEmail: parsed.data.contactEmail || null,
      contactPhone: parsed.data.contactPhone || null,
      address: parsed.data.address || null,
      suburb: parsed.data.suburb || null,
      state: parsed.data.state || null,
      postcode: parsed.data.postcode || null,
      source: parsed.data.source as LeadSource,
      tenderRef: parsed.data.tenderRef || null,
      tenderCloseDate: parsed.data.tenderCloseDate
        ? new Date(parsed.data.tenderCloseDate)
        : null,
      tenderUrl: parsed.data.tenderUrl || null,
      estimatedCapacity: parsed.data.estimatedCapacity || null,
      notes: parsed.data.notes || null,
      assignedToId: parsed.data.assignedToId || session!.user.id,
    },
    include: {
      assignedTo: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "Lead",
      entityId: lead.id,
      details: { schoolName: lead.schoolName, source: lead.source },
    },
  });

  return NextResponse.json(lead, { status: 201 });
});
