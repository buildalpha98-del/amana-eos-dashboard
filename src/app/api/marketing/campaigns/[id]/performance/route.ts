import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import {
  resolveCampaignWindow,
  getCampaignSendIds,
  getEmailEngagement,
  getQrScans,
  getAttributedEnquiries,
  getEnrolmentsWon,
  getOccupancyDelta,
} from "@/lib/campaign-attribution";

// GET /api/marketing/campaigns/:id/performance — attribution funnel for one
// campaign. Pure orchestration: load campaign + linked services, resolve the
// measurement window, fan out to the attribution lib (which owns every query).
export const GET = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id, deleted: false },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        services: { select: { serviceId: true } },
      },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const serviceIds = campaign.services.map((s) => s.serviceId);
    const window = resolveCampaignWindow(campaign);

    // Send ids feed engagement, so resolve them first; the rest fan out.
    const { sendIds, recipients } = await getCampaignSendIds(prisma, id);
    const [engagement, qr, enquiries, enrolments, occupancy] =
      await Promise.all([
        getEmailEngagement(prisma, sendIds, window),
        getQrScans(prisma, id, window),
        getAttributedEnquiries(prisma, id, serviceIds, window),
        getEnrolmentsWon(prisma, id, serviceIds, window),
        getOccupancyDelta(prisma, serviceIds, window),
      ]);

    // hasData = any funnel activity at all (occupancy nulls are "no rows",
    // deliberately excluded — they never make a campaign look measured).
    const hasData = [
      sendIds.length,
      recipients,
      engagement.uniqueOpens,
      engagement.uniqueClicks,
      qr.scans,
      enquiries.attributed,
      enquiries.contextual,
      enrolments.attributed,
      enrolments.contextual,
    ].some((n) => n > 0);

    return NextResponse.json({
      window,
      reach: { sends: sendIds.length, recipients },
      engagement,
      qr,
      enquiries,
      enrolments,
      occupancy,
      hasData,
    });
  },
  { roles: ["owner", "head_office", "admin", "marketing"] },
);
