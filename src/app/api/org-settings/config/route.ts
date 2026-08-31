/**
 * /api/org-settings/config
 *
 * Sibling route to /api/org-settings (which handles the legacy branding
 * fields: name, primaryColor, accentColor, purchaseBudgetTiers).
 *
 * This route owns the new runtime-config slice that used to be hardcoded:
 *   - Brevo email sender identity
 *   - Federal default educator ratio
 *   - Centre Health Score pillar weights + thresholds
 *
 * GET   — any authenticated user; returns the merged config + defaults
 *         so the settings form can pre-fill.
 * PATCH — owner/admin only; full-replace of the validated config
 *         document; activity-logged; cache-invalidated.
 *
 * 2026-05-16.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import {
  getOrgSettings,
  orgSettingsConfigSchema,
  writeOrgSettings,
} from "@/lib/org-settings";
import { getEmailBranding } from "@/lib/email-branding";

export const GET = withApiAuth(async () => {
  const config = await getOrgSettings();
  // Branding slice for the email composer's pristine layout seed. Read via
  // getEmailBranding() — the SAME source the send routes use for their
  // layout base (OrgSettings row name/primaryColor, non-sensitive) — so the
  // composer panel previews what an untouched send will actually render.
  // Needed here because this GET is open to any authed user, while the
  // row-level /api/org-settings GET is role-gated away from marketing users.
  const branding = await getEmailBranding();
  return NextResponse.json({ config, branding });
});

export const PATCH = withApiAuth(
  async (req, session) => {
    const body = await parseJsonBody(req);
    const parsed = orgSettingsConfigSchema.safeParse(
      (body as { config?: unknown })?.config,
    );
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues[0]?.message ?? "Invalid org settings payload",
        parsed.error.flatten(),
      );
    }

    const next = await writeOrgSettings(parsed.data, session!.user.id);

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "update_org_settings_config",
        entityType: "OrgSettings",
        entityId: "singleton",
        details: {
          keys: Object.keys(parsed.data),
        },
      },
    });

    return NextResponse.json({ config: next });
  },
  { roles: ["owner", "admin"], rateLimit: { max: 20, windowMs: 60_000 } },
);
