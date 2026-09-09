/**
 * cert-requirements — the ONE shared resolver for "which certificate types
 * does this role have to hold" (Staff Portal v2 Phase 9).
 *
 * The matrix lives in OrgSettings under `compliance.requiredCertsByRole`
 * (editable at /settings/organisation). Consumers:
 *
 *   - Staff `/compliance` (StaffComplianceView) — "Required for your role"
 *     split, resolved CLIENT-side from `GET /api/org-settings/config`
 *     (the client-safe slice; staff cannot read the role-gated
 *     `GET /api/org-settings`).
 *   - `/my-portal` compliance glance tile — required-only "N of M" count.
 *   - Staff-profile snapshot panel — required-only counts for the TARGET
 *     user's role, resolved SERVER-side via `getOrgSettings()` (60s cache).
 *
 * Pure + browser-safe: no Prisma, no fetch. Pass whatever settings object
 * you have; missing/partial settings fall back to the code defaults.
 */

import {
  REQUIRED_CERT_TYPE_VALUES,
  REQUIRED_CERTS_BY_ROLE_DEFAULTS,
  type RequiredCertType,
  type RequiredCertsByRole,
} from "@/lib/org-settings-shared";

const VALID_TYPES = new Set<string>(REQUIRED_CERT_TYPE_VALUES);

function isKnownRole(role: string): role is keyof RequiredCertsByRole {
  return Object.prototype.hasOwnProperty.call(
    REQUIRED_CERTS_BY_ROLE_DEFAULTS,
    role,
  );
}

/**
 * Resolve the certificate types required for `role`.
 *
 * - `orgSettings` may be the full merged config, just its `compliance`
 *   slice's parent, or absent entirely — anything missing falls back to
 *   `REQUIRED_CERTS_BY_ROLE_DEFAULTS`.
 * - Unknown roles (and null/undefined) resolve to `[]` — never throw.
 * - Stored values are defensively filtered to the canonical type list and
 *   de-duplicated, so a stale document can't surface a phantom type.
 */
export function getRequiredCertTypes(
  role: string | null | undefined,
  orgSettings?: {
    compliance?: { requiredCertsByRole?: Partial<Record<string, unknown>> };
  } | null,
): RequiredCertType[] {
  if (!role || !isKnownRole(role)) return [];

  const stored = orgSettings?.compliance?.requiredCertsByRole?.[role];
  const source = Array.isArray(stored)
    ? stored
    : REQUIRED_CERTS_BY_ROLE_DEFAULTS[role];

  const out: RequiredCertType[] = [];
  for (const entry of source) {
    if (
      typeof entry === "string" &&
      VALID_TYPES.has(entry) &&
      !out.includes(entry as RequiredCertType)
    ) {
      out.push(entry as RequiredCertType);
    }
  }
  return out;
}
