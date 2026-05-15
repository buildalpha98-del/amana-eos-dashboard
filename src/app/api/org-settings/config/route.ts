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

export const GET = withApiAuth(async () => {
  const config = await getOrgSettings();
  return NextResponse.json({ config });
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
