import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export const GET = withApiAuth(
  async () => {
    const activations = await prisma.campaignActivationAssignment.findMany({
      where: { campaign: { deleted: false } },
      orderBy: [{ activationDeliveredAt: "desc" }, { updatedAt: "desc" }],
      include: {
        campaign: { select: { id: true, name: true, type: true, startDate: true, endDate: true } },
        service: { select: { id: true, name: true, code: true } },
        recapPosts: { select: { id: true, status: true } },
      },
      take: 100,
    });

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
    });
  },
  { roles: ["marketing", "owner"] },
);
