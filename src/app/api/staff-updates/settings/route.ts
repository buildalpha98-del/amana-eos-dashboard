/** PATCH { coworkAutoApprove } — whether Cowork's staff emails skip approval. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { getOrgSettings, writeOrgSettings } from "@/lib/org-settings";

export const PATCH = withApiAuth(
  async (req, session) => {
    const parsed = z.object({ coworkAutoApprove: z.boolean() }).safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Invalid setting.");
    const current = await getOrgSettings();
    await writeOrgSettings(
      { ...current, notifications: { ...current.notifications, coworkStaffEmailsAutoApprove: parsed.data.coworkAutoApprove } },
      session.user.id,
    );
    return NextResponse.json({ coworkAutoApprove: parsed.data.coworkAutoApprove });
  },
  { roles: [...ADMIN_ROLES] },
);
