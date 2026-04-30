import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import {
  ActivationLifecycleStage,
  ActivationType,
  Prisma,
} from "@prisma/client";
import { getTermForDate } from "@/lib/school-terms";
import { isInFlight } from "@/lib/activation-lifecycle";

const ACTIVATION_CAMPAIGN_TYPES = ["event", "launch", "activation"] as const;

const RECAP_DUE_HOURS = 48;
const RECAP_OVERDUE_HOURS = 7 * 24;

function recapStatusFor(row: { activationDeliveredAt: Date | null; recapPublishedAt: Date | null }): "not_due" | "due_soon" | "overdue" | "published" {
  if (row.recapPublishedAt) return "published";
  if (!row.activationDeliveredAt) return "not_due";
  const ms = Date.now() - row.activationDeliveredAt.getTime();
  if (ms > RECAP_OVERDUE_HOURS * 3600_000) return "overdue";
  if (ms > RECAP_DUE_HOURS * 3600_000) return "due_soon";
  return "not_due";
}

function serialiseActivation(a: Prisma.CampaignActivationAssignmentGetPayload<{
  include: {
    campaign: { select: { id: true; name: true; type: true; status: true; startDate: true; endDate: true } };
    service: { select: { id: true; name: true; code: true; state: true } };
    coordinator: { select: { id: true; name: true } };
    recapPosts: { select: { id: true; status: true } };
  };
}>) {
  return {
    id: a.id,
    title: a.campaign.name,
    activationType: a.activationType,
    lifecycleStage: a.lifecycleStage,
    scheduledFor: a.scheduledFor?.toISOString() ?? null,
    daysUntilScheduled: a.scheduledFor
      ? Math.floor((a.scheduledFor.getTime() - Date.now()) / (24 * 3600_000))
      : null,
    daysSinceDelivered: a.activationDeliveredAt
      ? Math.floor((Date.now() - a.activationDeliveredAt.getTime()) / (24 * 3600_000))
      : null,
    expectedAttendance: a.expectedAttendance,
    actualAttendance: a.actualAttendance,
    enquiriesGenerated: a.enquiriesGenerated,
    budget: a.budget,
    notes: a.notes,
    termYear: a.termYear,
    termNumber: a.termNumber,
    timestamps: {
      conceptApprovedAt: a.conceptApprovedAt?.toISOString() ?? null,
      logisticsStartedAt: a.logisticsStartedAt?.toISOString() ?? null,
      finalPushStartedAt: a.finalPushStartedAt?.toISOString() ?? null,
      activationDeliveredAt: a.activationDeliveredAt?.toISOString() ?? null,
      recapPublishedAt: a.recapPublishedAt?.toISOString() ?? null,
      cancelledAt: a.cancelledAt?.toISOString() ?? null,
    },
    cancellationReason: a.cancellationReason,
    campaign: a.campaign,
    service: a.service,
    coordinator: a.coordinator,
    recapPostId: a.recapPosts[0]?.id ?? null,
    recapPostStatus: a.recapPosts[0]?.status ?? null,
    recapStatus: recapStatusFor(a),
  };
}

const querySchema = z.object({
  view: z.enum(["in_flight", "archive"]).optional(),
  serviceId: z.string().optional(),
  campaignId: z.string().optional(),
  termYear: z.coerce.number().int().optional(),
  termNumber: z.coerce.number().int().min(1).max(4).optional(),
  type: z.nativeEnum(ActivationType).optional(),
  lifecycleStage: z.nativeEnum(ActivationLifecycleStage).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const IN_FLIGHT_STAGES: ActivationLifecycleStage[] = ["concept", "approved", "logistics", "final_push"];
const ARCHIVE_STAGES: ActivationLifecycleStage[] = ["delivered", "recap_published", "cancelled"];

export const GET = withApiAuth(
  async (req) => {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten());
    const q = parsed.data;

    const where: Prisma.CampaignActivationAssignmentWhereInput = { campaign: { deleted: false } };
    if (q.view === "in_flight") where.lifecycleStage = { in: IN_FLIGHT_STAGES };
    if (q.view === "archive") where.lifecycleStage = { in: ARCHIVE_STAGES };
    if (q.lifecycleStage) where.lifecycleStage = q.lifecycleStage;
    if (q.serviceId) where.serviceId = q.serviceId;
    if (q.campaignId) where.campaignId = q.campaignId;
    if (q.termYear !== undefined) where.termYear = q.termYear;
    if (q.termNumber !== undefined) where.termNumber = q.termNumber;
    if (q.type) where.activationType = q.type;
    if (q.search) where.campaign = { ...(where.campaign as object), name: { contains: q.search, mode: "insensitive" } };

    const [activations, allRelevantCampaigns] = await Promise.all([
      prisma.campaignActivationAssignment.findMany({
        where,
        orderBy: [{ scheduledFor: "asc" }, { updatedAt: "desc" }],
        include: {
          campaign: { select: { id: true, name: true, type: true, status: true, startDate: true, endDate: true } },
          service: { select: { id: true, name: true, code: true, state: true } },
          coordinator: { select: { id: true, name: true } },
          recapPosts: { select: { id: true, status: true } },
        },
        take: q.limit ?? 200,
      }),
      // Surface campaigns of activation-eligible types with no assignments —
      // helps the user understand why a campaign they created isn't here.
      prisma.marketingCampaign.findMany({
        where: { deleted: false, type: { in: [...ACTIVATION_CAMPAIGN_TYPES] } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          startDate: true,
          endDate: true,
          activationAssignments: { select: { id: true } },
        },
        take: 100,
      }),
    ]);

    const unassigned = allRelevantCampaigns
      .filter((c) => c.activationAssignments.length === 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        startDate: c.startDate?.toISOString() ?? null,
        endDate: c.endDate?.toISOString() ?? null,
      }));

    return NextResponse.json({
      activations: activations.map(serialiseActivation),
      unassignedCampaigns: unassigned,
    });
  },
  { roles: ["marketing", "owner"] },
);

const createSchema = z.object({
  campaignId: z.string().min(1),
  serviceId: z.string().min(1),
  activationType: z.nativeEnum(ActivationType).optional(),
  scheduledFor: z.string().refine((d) => !Number.isNaN(Date.parse(d)), { message: "Invalid scheduledFor" }).optional(),
  expectedAttendance: z.number().int().min(0).optional(),
  budget: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
  coordinatorId: z.string().nullable().optional(),
});

export const POST = withApiAuth(
  async (req) => {
    const raw = await parseJsonBody(req);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const [campaign, service] = await Promise.all([
      prisma.marketingCampaign.findUnique({ where: { id: parsed.data.campaignId }, select: { id: true, startDate: true } }),
      prisma.service.findUnique({ where: { id: parsed.data.serviceId }, select: { id: true } }),
    ]);
    if (!campaign) throw ApiError.badRequest("Unknown campaignId");
    if (!service) throw ApiError.badRequest("Unknown serviceId");

    const scheduled = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : campaign.startDate;
    const term = scheduled ? getTermForDate(scheduled) : null;

    try {
      const created = await prisma.campaignActivationAssignment.create({
        data: {
          campaignId: parsed.data.campaignId,
          serviceId: parsed.data.serviceId,
          activationType: parsed.data.activationType ?? null,
          scheduledFor: scheduled ?? null,
          expectedAttendance: parsed.data.expectedAttendance ?? null,
          budget: parsed.data.budget ?? null,
          notes: parsed.data.notes ?? null,
          coordinatorId: parsed.data.coordinatorId ?? null,
          termYear: term?.year ?? null,
          termNumber: term?.number ?? null,
          lifecycleStage: "concept",
        },
        include: {
          campaign: { select: { id: true, name: true, type: true, status: true, startDate: true, endDate: true } },
          service: { select: { id: true, name: true, code: true, state: true } },
          coordinator: { select: { id: true, name: true } },
          recapPosts: { select: { id: true, status: true } },
        },
      });
      return NextResponse.json(serialiseActivation(created), { status: 201 });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "P2002") throw ApiError.conflict("This service is already assigned to that campaign");
      throw err;
    }
  },
  { roles: ["marketing", "owner"] },
);
