/**
 * POST /api/policies/sharepoint-sync — admin "Sync from SharePoint" on the
 * Policies page. Same code as the daily cron. Returns the summary; if
 * `pending` > 0, press again to carry on (each run converts a batch).
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import {
  isSharepointPolicySyncConfigured,
  runSharepointPolicySync,
} from "@/lib/sharepoint-policies";

export const maxDuration = 300;

export const POST = withApiAuth(
  async () => {
    if (!isSharepointPolicySyncConfigured()) {
      throw new ApiError(503, "SharePoint isn't connected yet — the Microsoft 365 app registration is still to be set up.");
    }
    try {
      return NextResponse.json(await runSharepointPolicySync());
    } catch (err) {
      throw new ApiError(502, err instanceof Error ? err.message : "SharePoint sync failed");
    }
  },
  // The handler's own timeout must outlast a batch of PDF conversions.
  { roles: [...ADMIN_ROLES], rateLimit: { max: 6, windowMs: 60_000 }, timeoutMs: 290_000 },
);
