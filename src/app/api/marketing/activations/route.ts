import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

const ACTIVATION_TYPES = ["event", "launch", "activation"] as const;

export const GET = withApiAuth(
  async () => {
    const [activations, allRelevantCampaigns] = await Promise.all([
      prisma.campaignActivationAssignment.findMany({
        where: { campaign: { deleted: false } },
        orderBy: [{ activationDeliveredAt: "desc" }, { updatedAt: "desc" }],
        include: {
          campaign: { select: { id: true, name: true, type: true, startDate: true, endDate: true, status: true } },
          service: { select: { id: true, name: true, code: true } },
          recapPosts: { select: { id: true, status: true } },
        },
        take: 200,
      }),
      prisma.marketingCampaign.findMany({
        where: { deleted: false, type: { in: [...ACTIVATION_TYPES] } },
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
      activations: activations.map((a) => ({
        id: a.id,
        status: a.status,
        activationDeliveredAt: a.activationDeliveredAt?.toISOString() ?? null,
        budget: a.budget,
        campaign: a.campaign,
        service: a.service,
        recapPostId: a.recapPosts[0]?.id ?? null,
        recapPostStatus: a.recapPosts[0]?.status ?? null,
      })),
      unassignedCampaigns: unassigned,
    });
  },
  { roles: ["marketing", "owner"] },
);
