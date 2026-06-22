/**
 * GET /api/settings/role-permissions
 *   Returns the current per-role page-access overrides + the
 *   compile-time defaults so the matrix UI can render both.
 *   Owner / admin / head_office may read.
 *
 * PUT /api/settings/role-permissions
 *   Body: { overrides: Record<Role, string[] | null> }
 *   Owner-only. Persists the overrides into OrgSettings.config.
 *   Guardrails enforced server-side:
 *     - Owner row is forced back to null (always default-full)
 *     - Admin must retain access to /settings (or the org can lock itself out)
 *
 * 2026-06-02: introduced for the /settings/permissions matrix.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getOrgSettings, writeOrgSettings } from "@/lib/org-settings";
import {
  allPages,
  rolePageAccess,
} from "@/lib/role-permissions";

const overridesSchema = z.object({
  overrides: z.object({
    owner: z.array(z.string()).nullable(),
    head_office: z.array(z.string()).nullable(),
    admin: z.array(z.string()).nullable(),
    marketing: z.array(z.string()).nullable(),
    member: z.array(z.string()).nullable(),
    staff: z.array(z.string()).nullable(),
    eos_viewer: z.array(z.string()).nullable(),
  }),
});

// Admin must always retain access to these paths — without them the
// permissions matrix itself, the org settings, and the user/team
// management surfaces are unreachable. Server enforces this guardrail
// so a forged PUT can't lock the org out via the API.
const ADMIN_REQUIRED_PATHS = [
  "/settings",
  "/settings/permissions",
  "/settings/organisation",
  "/team",
  "/dashboard",
];

export const GET = withApiAuth(
  async () => {
    const config = await getOrgSettings();
    return NextResponse.json({
      // The override map — current saved values. Null per role means
      // "fall back to the compile-time default".
      overrides: config.rolePageOverrides,
      // Defaults so the matrix UI can render a "Reset to defaults"
      // affordance without recomputing them client-side.
      defaults: rolePageAccess as Record<Role, readonly string[]>,
      // All known pages so the matrix knows which rows to render.
      pages: allPages,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const PUT = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = overridesSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues[0]?.message ?? "Invalid overrides payload",
        parsed.error.flatten(),
      );
    }

    // Sanitise: only allow paths that exist in `allPages`. A typo or
    // forged path silently drops out of the saved override.
    const allowedPathSet = new Set<string>(allPages as readonly string[]);
    const sanitised: typeof parsed.data.overrides = {
      owner: null,
      head_office: null,
      admin: null,
      marketing: null,
      member: null,
      staff: null,
      eos_viewer: null,
    };

    for (const role of Object.keys(parsed.data.overrides) as Role[]) {
      const value = parsed.data.overrides[role];
      if (value === null) {
        sanitised[role] = null;
      } else {
        sanitised[role] = value.filter((p) => allowedPathSet.has(p));
      }
    }

    // Guardrail 1: owner is always full-access (null = defaults =
    // every page). We refuse to persist a restricted owner override.
    sanitised.owner = null;

    // Guardrail 2: admin must retain access to the required paths.
    // If the caller's payload removed any of them, add them back.
    if (sanitised.admin !== null) {
      const adminSet = new Set(sanitised.admin);
      for (const p of ADMIN_REQUIRED_PATHS) {
        adminSet.add(p);
      }
      sanitised.admin = [...adminSet];
    }

    // Load + replace the rolePageOverrides slice; keep everything else.
    const current = await getOrgSettings();
    const next = {
      ...current,
      rolePageOverrides: sanitised,
    };
    await writeOrgSettings(next, session!.user.id);

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "update_role_permissions",
        entityType: "OrgSettings",
        entityId: "singleton",
        details: {
          rolesChanged: (Object.keys(sanitised) as Role[]).filter(
            (r) =>
              JSON.stringify(sanitised[r]) !==
              JSON.stringify(current.rolePageOverrides?.[r] ?? null),
          ),
        },
      },
    });

    return NextResponse.json({ overrides: sanitised });
  },
  // Owner-only — admins can READ the matrix (so a non-owner admin can
  // see what's allowed) but not save changes.
  { roles: ["owner"] },
);
