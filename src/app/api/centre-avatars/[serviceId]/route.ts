import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import {
  SECTION_KEYS,
  SECTION_LABELS,
  sectionSchemas,
  type SectionKey,
} from "@/lib/centre-avatar/sections";
import { classifyFreshness, daysSince } from "@/lib/centre-avatar/freshness";
import { deepMergeSection } from "@/lib/centre-avatar/deep-merge";

type RouteCtx = { params: Promise<{ serviceId: string }> };

/**
 * GET /api/centre-avatars/[serviceId]
 *
 * Returns the full Avatar: all four JSON sections plus the most recent 20
 * entries from each living log (insights, campaign log, check-ins, school
 * liaison, update log).
 */
export const GET = withApiAuth(
  async (_req, session, context) => {
    const { serviceId } = await (context as unknown as RouteCtx).params;

    // Coordinators can only read their own service's Avatar.
    if (
      session.user.role === "coordinator" &&
      session.user.serviceId !== serviceId
    ) {
      throw ApiError.forbidden(
        "Coordinators can only view their own centre's Avatar",
      );
    }

    const avatar = await prisma.centreAvatar.findUnique({
      where: { serviceId },
      include: {
        service: { select: { id: true, name: true, state: true } },
        lastUpdatedBy: { select: { id: true, name: true } },
        lastReviewedBy: { select: { id: true, name: true } },
        lastOpenedBy: { select: { id: true, name: true } },
        insights: {
          orderBy: { occurredAt: "desc" },
          take: 20,
          include: { createdBy: { select: { id: true, name: true } } },
        },
        campaignLog: {
          orderBy: { occurredAt: "desc" },
          take: 20,
          include: {
            createdBy: { select: { id: true, name: true } },
            marketingCampaign: { select: { id: true, name: true } },
          },
        },
        coordinatorCheckIns: {
          orderBy: { occurredAt: "desc" },
          take: 20,
          include: {
            coordinator: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
          },
        },
        schoolLiaisonLog: {
          orderBy: { occurredAt: "desc" },
          take: 20,
          include: { createdBy: { select: { id: true, name: true } } },
        },
        updateLog: {
          orderBy: { occurredAt: "desc" },
          take: 50,
          include: { updatedBy: { select: { id: true, name: true } } },
        },
      },
    });

    if (!avatar) throw ApiError.notFound("Centre Avatar not found for that service");

    return NextResponse.json({
      avatar: {
        id: avatar.id,
        serviceId: avatar.serviceId,
        serviceName: avatar.service.name,
        state: avatar.service.state,
        version: avatar.version,
        snapshot: avatar.snapshot,
        parentAvatar: avatar.parentAvatar,
        programmeMix: avatar.programmeMix,
        assetLibrary: avatar.assetLibrary,
        lastUpdatedAt: avatar.lastUpdatedAt.toISOString(),
        lastUpdatedBy: avatar.lastUpdatedBy,
        lastReviewedAt: avatar.lastReviewedAt?.toISOString() ?? null,
        lastReviewedBy: avatar.lastReviewedBy,
        lastFullReviewAt: avatar.lastFullReviewAt?.toISOString() ?? null,
        lastOpenedAt: avatar.lastOpenedAt?.toISOString() ?? null,
        lastOpenedBy: avatar.lastOpenedBy,
        daysSinceUpdate: daysSince(avatar.lastUpdatedAt),
        freshness: classifyFreshness(avatar.lastUpdatedAt),
        insights: avatar.insights,
        campaignLog: avatar.campaignLog,
        coordinatorCheckIns: avatar.coordinatorCheckIns,
        schoolLiaisonLog: avatar.schoolLiaisonLog,
        updateLog: avatar.updateLog,
      },
    });
  },
  {
    roles: ["marketing", "owner", "admin", "head_office", "coordinator"],
  },
);

/**
 * PATCH /api/centre-avatars/[serviceId]
 *
 * Section-level update. Replaces the entire section JSON blob. Writes an
 * update-log entry in the same transaction for the audit trail.
 */
const patchBodySchema = z.object({
  section: z.enum(SECTION_KEYS),
  content: z.record(z.string(), z.unknown()),
  changeSummary: z.string().max(500).optional(),
});

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { serviceId } = await (context as unknown as RouteCtx).params;

    const raw = await parseJsonBody(req);
    const parsed = patchBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid patch payload", parsed.error.flatten());
    }
    const { section, content, changeSummary } = parsed.data;

    const sectionParsed = sectionSchemas[section as SectionKey].safeParse(content);
    if (!sectionParsed.success) {
      throw ApiError.badRequest(
        `Invalid ${SECTION_LABELS[section as SectionKey]} payload`,
        sectionParsed.error.flatten(),
      );
    }

    const avatar = await prisma.centreAvatar.findUnique({ where: { serviceId } });
    if (!avatar) throw ApiError.notFound("Centre Avatar not found for that service");

    // Deep-merge new content over existing section data so partial payloads
    // (e.g. a form that only sends one subsection) can never wipe sibling
    // fields. Use `null` in the payload to explicitly clear a field.
    const previousSection = (avatar as Record<string, unknown>)[section as SectionKey];
    const merged = deepMergeSection(previousSection, sectionParsed.data);

    const now = new Date();
    const summary = changeSummary?.trim() || `Edited ${SECTION_LABELS[section as SectionKey]}`;

    await prisma.$transaction([
      prisma.centreAvatar.update({
        where: { id: avatar.id },
        data: {
          [section]: merged as never,
          lastUpdatedAt: now,
          lastUpdatedById: session.user.id,
        },
      }),
      prisma.centreAvatarUpdateLog.create({
        data: {
          centreAvatarId: avatar.id,
          occurredAt: now,
          sectionsChanged: [section],
          summary,
          updatedById: session.user.id,
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  },
  { roles: ["marketing", "owner"] },
);
