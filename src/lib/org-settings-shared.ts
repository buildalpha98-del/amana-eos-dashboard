/**
 * Shared org-settings types, defaults and Zod validators that are safe
 * to import from client components.
 *
 * The server-only counterpart (`@/lib/org-settings`) re-exports everything
 * here and adds the Prisma-backed reader/writer + in-process cache.
 * Splitting them avoids pulling Prisma into the client bundle, which
 * blows up at runtime ("PrismaClient is unable to run in this browser
 * environment").
 *
 * 2026-05-16.
 */

import { z } from "zod";
import type { Role } from "@prisma/client";

// ─── Schema ─────────────────────────────────────────────────────────────────

const ratioStringSchema = z
  .string()
  .regex(/^\d+:\d+$/i, "Use the form '1:15' (educator : children)");

const pillarWeightsSchema = z
  .object({
    financial: z.number().min(0).max(1),
    operational: z.number().min(0).max(1),
    compliance: z.number().min(0).max(1),
    satisfaction: z.number().min(0).max(1),
    teamCulture: z.number().min(0).max(1),
  })
  .refine(
    (w) => {
      const sum =
        w.financial +
        w.operational +
        w.compliance +
        w.satisfaction +
        w.teamCulture;
      return Math.abs(sum - 1) < 0.001;
    },
    { message: "Pillar weights must sum to 1.0" },
  );

const thresholdsSchema = z
  .object({
    green: z.number().min(0).max(100),
    amber: z.number().min(0).max(100),
  })
  .refine((t) => t.green > t.amber, {
    message: "Green threshold must be greater than amber",
  });

const roleLabelsSchema = z.object({
  owner: z.string().min(1).max(60),
  head_office: z.string().min(1).max(60),
  admin: z.string().min(1).max(60),
  marketing: z.string().min(1).max(60),
  member: z.string().min(1).max(60),
  staff: z.string().min(1).max(60),
});

export const orgSettingsConfigSchema = z.object({
  email: z.object({
    senderEmail: z.string().email(),
    senderName: z.string().min(1).max(100),
  }),
  ratios: z.object({
    federalDefaultMinRatio: ratioStringSchema,
  }),
  healthScore: z.object({
    pillarWeights: pillarWeightsSchema,
    thresholds: thresholdsSchema,
  }),
  // 2026-05-16: user-facing role display names. Renamed twice in recent
  // history (coordinator collapse, member → OSHC Educator) — each rename
  // previously needed a code push. Now editable in /settings/organisation.
  // The DB rows still reference the Prisma `Role` enum (owner, head_office,
  // admin, marketing, member, staff); the label is purely cosmetic.
  roleLabels: roleLabelsSchema,
});

export type OrgSettingsConfig = z.infer<typeof orgSettingsConfigSchema>;

export type RoleLabels = OrgSettingsConfig["roleLabels"];

/** Static fallback used by `useRoleLabel()` when no provider is mounted. */
export const ROLE_LABEL_DEFAULTS: RoleLabels = {
  owner: "Owner",
  head_office: "State Manager",
  admin: "Admin",
  marketing: "Marketing",
  member: "OSHC Educator",
  staff: "Educator",
};

/** Server-safe label getter. Pass the merged `OrgSettingsConfig.roleLabels`. */
export function getRoleLabel(role: Role, labels: RoleLabels = ROLE_LABEL_DEFAULTS): string {
  return labels[role] ?? ROLE_LABEL_DEFAULTS[role] ?? role;
}

// ─── Code defaults ──────────────────────────────────────────────────────────
// These mirror the constants that used to be hardcoded in brevo.ts,
// ratio-compute.ts, and health-score.ts. They're the fallback when no DB
// row (or an incomplete one) exists. Reading `process.env.BREVO_*` is safe
// at module evaluation time on both server and client (the values are
// inlined as empty strings on the client by Next.js).

export const ORG_SETTINGS_DEFAULTS: OrgSettingsConfig = {
  email: {
    senderEmail: process.env.BREVO_SENDER_EMAIL || "admin@amanaoshc.com.au",
    senderName: process.env.BREVO_SENDER_NAME || "Amana OSHC",
  },
  ratios: {
    federalDefaultMinRatio: "1:15",
  },
  healthScore: {
    pillarWeights: {
      financial: 0.3,
      operational: 0.25,
      compliance: 0.2,
      satisfaction: 0.15,
      teamCulture: 0.1,
    },
    thresholds: {
      green: 75,
      amber: 50,
    },
  },
  roleLabels: ROLE_LABEL_DEFAULTS,
};

// ─── Merger ─────────────────────────────────────────────────────────────────

/**
 * Deep-merge an arbitrary partial settings object on top of the defaults.
 * Returns a complete `OrgSettingsConfig` so callers never need `?.` chains.
 *
 * Permissive on read: drops invalid types silently and falls back to the
 * default for that field. Validation belongs at the write boundary (in
 * the PATCH route), not here.
 */
export function mergeOrgSettings(
  partial: unknown,
  defaults: OrgSettingsConfig = ORG_SETTINGS_DEFAULTS,
): OrgSettingsConfig {
  const safe = (partial && typeof partial === "object" ? partial : {}) as Record<
    string,
    unknown
  >;
  const email = (safe.email && typeof safe.email === "object" ? safe.email : {}) as Record<
    string,
    unknown
  >;
  const ratios = (safe.ratios && typeof safe.ratios === "object" ? safe.ratios : {}) as Record<
    string,
    unknown
  >;
  const hs = (safe.healthScore && typeof safe.healthScore === "object"
    ? safe.healthScore
    : {}) as Record<string, unknown>;
  const hsW = (hs.pillarWeights && typeof hs.pillarWeights === "object"
    ? hs.pillarWeights
    : {}) as Record<string, unknown>;
  const hsT = (hs.thresholds && typeof hs.thresholds === "object"
    ? hs.thresholds
    : {}) as Record<string, unknown>;
  const rl = (safe.roleLabels && typeof safe.roleLabels === "object"
    ? safe.roleLabels
    : {}) as Record<string, unknown>;
  const pickLabel = (key: keyof RoleLabels): string =>
    typeof rl[key] === "string" && (rl[key] as string).length > 0
      ? (rl[key] as string)
      : defaults.roleLabels[key];

  return {
    email: {
      senderEmail:
        typeof email.senderEmail === "string" && email.senderEmail.length > 0
          ? (email.senderEmail as string)
          : defaults.email.senderEmail,
      senderName:
        typeof email.senderName === "string" && email.senderName.length > 0
          ? (email.senderName as string)
          : defaults.email.senderName,
    },
    ratios: {
      federalDefaultMinRatio:
        typeof ratios.federalDefaultMinRatio === "string" &&
        /^\d+:\d+$/.test(ratios.federalDefaultMinRatio)
          ? (ratios.federalDefaultMinRatio as string)
          : defaults.ratios.federalDefaultMinRatio,
    },
    healthScore: {
      pillarWeights: {
        financial:
          typeof hsW.financial === "number"
            ? (hsW.financial as number)
            : defaults.healthScore.pillarWeights.financial,
        operational:
          typeof hsW.operational === "number"
            ? (hsW.operational as number)
            : defaults.healthScore.pillarWeights.operational,
        compliance:
          typeof hsW.compliance === "number"
            ? (hsW.compliance as number)
            : defaults.healthScore.pillarWeights.compliance,
        satisfaction:
          typeof hsW.satisfaction === "number"
            ? (hsW.satisfaction as number)
            : defaults.healthScore.pillarWeights.satisfaction,
        teamCulture:
          typeof hsW.teamCulture === "number"
            ? (hsW.teamCulture as number)
            : defaults.healthScore.pillarWeights.teamCulture,
      },
      thresholds: {
        green:
          typeof hsT.green === "number"
            ? (hsT.green as number)
            : defaults.healthScore.thresholds.green,
        amber:
          typeof hsT.amber === "number"
            ? (hsT.amber as number)
            : defaults.healthScore.thresholds.amber,
      },
    },
    roleLabels: {
      owner: pickLabel("owner"),
      head_office: pickLabel("head_office"),
      admin: pickLabel("admin"),
      marketing: pickLabel("marketing"),
      member: pickLabel("member"),
      staff: pickLabel("staff"),
    },
  };
}
