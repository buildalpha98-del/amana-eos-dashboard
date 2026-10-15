/** GET /api/parent-journey/preview?id=&serviceId= — one email, rendered. */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { PREVIEWABLE_EMAIL_IDS } from "@/lib/parent-journey-map";
import { renderJourneyEmail } from "@/lib/parent-journey-preview";

export const GET = withApiAuth(
  async (req) => {
    const q = new URL(req.url).searchParams;
    const id = q.get("id") ?? "";
    if (!PREVIEWABLE_EMAIL_IDS.includes(id)) throw ApiError.badRequest("Unknown email.");
    const out = await renderJourneyEmail(id, q.get("serviceId"));
    if (!out) throw ApiError.badRequest("Pick a centre to preview this email.");
    return NextResponse.json(out);
  },
  { roles: ["owner", "head_office", "admin", "marketing"] },
);
