/**
 * POST /api/activity-templates/fill — "Fill in missing details" on the
 * Activity Library (admins). Runs the Claude auto-fill straight away for up
 * to about four minutes and says how many entries it filled and how many
 * are left — or exactly why it couldn't, instead of failing silently in the
 * background.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { countEntriesToFill, enrichLibraryEntries, sweepActivitiesIntoLibrary } from "@/lib/program-plan/library";

export const maxDuration = 300;

export const POST = withApiAuth(
  async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ApiError(503, "Claude isn't connected (ANTHROPIC_API_KEY is missing), so details can't be drafted.");
    }
    await sweepActivitiesIntoLibrary();
    try {
      const filled = await enrichLibraryEntries({ limit: 200, deadline: Date.now() + 200_000 });
      return NextResponse.json({ filled, remaining: await countEntriesToFill() });
    } catch (err) {
      throw new ApiError(502, `Couldn't fill in details: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  { roles: [...ADMIN_ROLES], rateLimit: { max: 4, windowMs: 60_000 }, timeoutMs: 290_000 },
);
