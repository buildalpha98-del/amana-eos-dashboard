import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { audienceRulesSchema } from "@/lib/audience-rules";
import { countAudienceRecipients } from "@/lib/audience-count";

const AUDIENCE_ROLES = ["owner", "head_office", "admin", "marketing"] as const;

const bodySchema = z.object({
  rules: audienceRulesSchema,
});

// POST /api/email/audiences/preview-count — live post-suppression count for
// DRAFT rules (not yet saved). The AudienceManagerModal's live preview posts
// here while the user edits condition rows; saved audiences use
// GET /api/email/audiences/:id (which returns the same count) or
// GET /api/email/recipient-count?audienceId=.
export const POST = withApiAuth(async (req) => {
  const body = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const count = await countAudienceRecipients(parsed.data.rules);

  return NextResponse.json({ count });
}, { roles: [...AUDIENCE_ROLES] });
