/**
 * Strict whitelist schema for USER-SUPPLIED email layout options.
 *
 * The composer's "Header & Footer" panel lets a marketer override the
 * org-branding layout base on a per-send basis. Those overrides travel in
 * request bodies to /api/email/campaign/send, /api/email/test-send and
 * /api/email/preview, then get interpolated into the marketing layout HTML —
 * so every field is whitelisted and shape-checked here BEFORE it reaches
 * `marketingLayout()` (which additionally HTML-escapes all interpolations;
 * this schema is the semantic gate, the escaping is the injection gate).
 *
 * Mirrors `EmailLayoutOptions` in email-marketing-layout.ts — all fields
 * optional, `.strict()` so unknown keys are rejected rather than silently
 * dropped.
 */

import { z } from "zod";
import { isTrustedBlobUrl } from "@/lib/trusted-urls";
import type { EmailLayoutOptions } from "@/lib/email-marketing-layout";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export const layoutOptionsSchema = z
  .object({
    headerColor: z
      .string()
      .regex(HEX_COLOR, "headerColor must be a 6-digit hex colour like #004E64")
      .optional(),
    headerText: z.string().max(120).optional(),
    // Rendered as an <img src> — same Blob-host allowlist as every other
    // user-supplied embedded URL (see creative-request attachment-schema).
    // Empty string means "no logo, render the header text instead".
    headerLogoUrl: z
      .string()
      .refine((v) => v === "" || isTrustedBlobUrl(v), {
        message: "headerLogoUrl must be an upload URL from this dashboard",
      })
      .optional(),
    footerText: z.string().max(200).optional(),
    // A plain link (not an embed) — any https URL is fine, but never http
    // or javascript: schemes.
    footerUrl: z
      .string()
      .refine(isHttpsUrl, { message: "footerUrl must be an https:// URL" })
      .optional(),
    footerUrlLabel: z.string().max(120).optional(),
    showUnsubscribe: z.boolean().optional(),
  })
  .strict();

export type LayoutOptionsInput = z.infer<typeof layoutOptionsSchema>;

// ── Composer payload helpers (client-safe, pure) ─────────────────

/** Every layout field the composer's Header & Footer panel can edit. */
export const LAYOUT_OPTION_KEYS = [
  "headerColor",
  "headerText",
  "headerLogoUrl",
  "footerText",
  "footerUrl",
  "footerUrlLabel",
  "showUnsubscribe",
] as const satisfies readonly (keyof EmailLayoutOptions)[];

/**
 * Build the outgoing `layoutOptions` payload from the fields the user has
 * ACTUALLY touched. Untouched fields are omitted so the server's
 * `{ ...brandingBase, ...body.layoutOptions }` merge keeps them tracking
 * live org branding — shipping the whole seeded panel would silently
 * freeze org branding at whatever the composer happened to seed.
 *
 * Unknown keys (stale draft junk) are dropped so the payload can never
 * trip the strict schema's unknown-key rejection.
 */
export function pickTouchedLayoutOptions(
  options: EmailLayoutOptions,
  touchedKeys: readonly string[],
): EmailLayoutOptions {
  const picked: Record<string, unknown> = {};
  for (const key of LAYOUT_OPTION_KEYS) {
    if (!touchedKeys.includes(key)) continue;
    const value = options[key];
    if (value === undefined) continue;
    picked[key] = value;
  }
  return picked as EmailLayoutOptions;
}

/**
 * Restore the touched-keys set from a persisted composer draft.
 *
 * - Current drafts store `touchedLayoutKeys: string[]` — filtered to known
 *   layout fields (junk entries from hand-edited localStorage are dropped).
 * - Legacy drafts (the short-lived boolean-only shape) stored just
 *   `layoutDirty` — `true` conservatively restores ALL keys, preserving the
 *   old "whole panel ships" behaviour for edits the user explicitly made,
 *   rather than silently dropping them from future sends.
 */
export function resolveTouchedLayoutKeys(draft: {
  touchedLayoutKeys?: unknown;
  layoutDirty?: unknown;
}): string[] {
  if (Array.isArray(draft.touchedLayoutKeys)) {
    return draft.touchedLayoutKeys.filter(
      (key): key is string =>
        typeof key === "string" &&
        (LAYOUT_OPTION_KEYS as readonly string[]).includes(key),
    );
  }
  return draft.layoutDirty === true ? [...LAYOUT_OPTION_KEYS] : [];
}
