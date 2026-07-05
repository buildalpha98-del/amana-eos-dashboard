/**
 * POST /api/meetings/[id]/prepare — draft the L10 agenda with AI.
 *
 * Facilitator-triggered counterpart to the morning-briefing cron's
 * automatic same-day prep. Regenerating overwrites the previous draft
 * (the draft is advisory — nothing downstream depends on it).
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import {
  prepareMeetingAgenda,
  MeetingNotFoundError,
  MeetingNotPreparableError,
} from "@/lib/l10-prep";

export const POST = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await context!.params!;
    try {
      const draft = await prepareMeetingAgenda(id);
      return NextResponse.json({ draft }, { status: 200 });
    } catch (err) {
      if (err instanceof MeetingNotFoundError) {
        throw ApiError.notFound("Meeting not found");
      }
      if (err instanceof MeetingNotPreparableError) {
        throw ApiError.conflict(err.message);
      }
      throw err;
    }
  },
  // AI drafting takes longer than the default route timeout.
  { timeoutMs: 120_000, rateLimit: { max: 10, windowMs: 60_000 } },
);
