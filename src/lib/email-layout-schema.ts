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
