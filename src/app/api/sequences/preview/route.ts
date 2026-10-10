import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { buildFlowPreviews } from "@/lib/sequence-preview";

/**
 * GET /api/sequences/preview — every email flow (parent nurture + CRM
 * outreach) with each step rendered as the recipient would see it, using
 * sample names. Powers CRM → Email flows.
 */
export const GET = withApiAuth(
  async () => {
    const { flows, sampleCentre } = await buildFlowPreviews();
    return NextResponse.json({ flows, sampleCentre });
  },
  { roles: ["owner", "head_office", "admin", "marketing"] },
);
