import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import type { AudienceRules } from "@/lib/audience-rules";
import {
  countAudienceRecipients,
  parseStoredAudienceRules,
} from "@/lib/audience-count";

// GET /api/email/recipient-count?serviceId=…&serviceId=…  (legacy picker)
// GET /api/email/recipient-count?audienceId=…             (saved audience)
//
// Both paths resolve through the SAME audience-rules compiler as
// campaign/send — the count preview must match what will actually go out
// (post-suppression), so never hand-roll a where clause here.
export const GET = withApiAuth(async (req) => {
  const audienceId = req.nextUrl.searchParams.get("audienceId");

  let rules: AudienceRules;
  if (audienceId) {
    const audience = await prisma.emailAudience.findUnique({
      where: { id: audienceId },
    });
    if (!audience) {
      throw ApiError.notFound("Audience not found");
    }
    if (audience.archived) {
      throw ApiError.conflict("Audience is archived");
    }
    rules = parseStoredAudienceRules(audience.rules, audience.id);
  } else {
    const serviceIds = req.nextUrl.searchParams.getAll("serviceId");
    rules = serviceIds.length > 0 ? { serviceIds } : {};
  }

  const count = await countAudienceRecipients(rules);

  return NextResponse.json({ count });
});
