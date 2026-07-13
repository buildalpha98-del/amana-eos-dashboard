/**
 * GET /api/centre-avatars/[serviceId]/pdf
 *
 * Branded PDF snapshot of a Centre Avatar — used as a paper/PDF
 * backup by Akram and the coordinators in case dashboard data is
 * ever lost. Covers every editable section (snapshot, parent avatar,
 * programme mix, asset library) plus the five living logs.
 *
 * Same access rules as the parent GET route:
 *   - marketing / owner / admin / head_office: any service
 *   - member (coordinator): only their own centre
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { generateCentreAvatarPdf } from "@/lib/centre-avatar-pdf";
import { classifyFreshness } from "@/lib/centre-avatar/freshness";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ serviceId: string }> };

export const GET = withApiAuth(
  async (_req, session, context) => {
    const { serviceId } = await (context as unknown as RouteCtx).params;

    if (
      session.user.role === "member" &&
      session.user.serviceId !== serviceId
    ) {
      throw ApiError.forbidden(
        "Coordinators can only export their own centre's Avatar",
      );
    }

    const avatar = await prisma.centreAvatar.findUnique({
      where: { serviceId },
      include: {
        service: { select: { name: true, state: true } },
        lastUpdatedBy: { select: { name: true } },
        lastReviewedBy: { select: { name: true } },
        insights: {
          orderBy: { occurredAt: "desc" },
          include: { createdBy: { select: { name: true } } },
        },
        campaignLog: {
          orderBy: { occurredAt: "desc" },
          include: { createdBy: { select: { name: true } } },
        },
        coordinatorCheckIns: {
          orderBy: { occurredAt: "desc" },
          include: { coordinator: { select: { name: true } } },
        },
        schoolLiaisonLog: {
          orderBy: { occurredAt: "desc" },
          include: { createdBy: { select: { name: true } } },
        },
        updateLog: {
          orderBy: { occurredAt: "desc" },
          include: { updatedBy: { select: { name: true } } },
        },
      },
    });

    if (!avatar) {
      throw ApiError.notFound("Centre Avatar not found for that service");
    }

    const doc = await generateCentreAvatarPdf({
      serviceName: avatar.service.name,
      state: avatar.service.state,
      version: avatar.version,
      freshness: classifyFreshness(avatar.lastUpdatedAt),
      lastUpdatedAt: avatar.lastUpdatedAt.toISOString(),
      lastUpdatedBy: avatar.lastUpdatedBy,
      lastReviewedAt: avatar.lastReviewedAt?.toISOString() ?? null,
      lastReviewedBy: avatar.lastReviewedBy,
      snapshot: avatar.snapshot,
      parentAvatar: avatar.parentAvatar,
      programmeMix: avatar.programmeMix,
      assetLibrary: avatar.assetLibrary,
      insights: avatar.insights.map((i) => ({
        occurredAt: i.occurredAt.toISOString(),
        source: i.source,
        insight: i.insight,
        impactOnAvatar: i.impactOnAvatar,
        status: i.status,
        createdBy: i.createdBy,
      })),
      campaignLog: avatar.campaignLog.map((c) => ({
        occurredAt: c.occurredAt.toISOString(),
        campaignName: c.campaignName,
        contentUsed: c.contentUsed,
        result: c.result,
        learnings: c.learnings,
        createdBy: c.createdBy,
      })),
      coordinatorCheckIns: avatar.coordinatorCheckIns.map((c) => ({
        occurredAt: c.occurredAt.toISOString(),
        topicsDiscussed: c.topicsDiscussed,
        actionItems: c.actionItems,
        followUpDate: c.followUpDate?.toISOString() ?? null,
        coordinator: c.coordinator,
      })),
      schoolLiaisonLog: avatar.schoolLiaisonLog.map((l) => ({
        occurredAt: l.occurredAt.toISOString(),
        contactName: l.contactName,
        purpose: l.purpose,
        outcome: l.outcome,
        nextStep: l.nextStep,
        createdBy: l.createdBy,
      })),
      updateLog: avatar.updateLog.map((u) => ({
        occurredAt: u.occurredAt.toISOString(),
        sectionsChanged: u.sectionsChanged,
        summary: u.summary,
        updatedBy: u.updatedBy,
      })),
    });

    const buffer = Buffer.from(doc.output("arraybuffer"));
    const slug = avatar.service.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const filename = `amana-centre-avatar-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  },
  {
    roles: ["marketing", "owner", "admin", "head_office", "member"],
  },
);
