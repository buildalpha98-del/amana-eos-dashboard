/**
 * The ONE zod schema for designed-email blocks (EmailBlock in
 * email-marketing-layout.ts) — shared by the template library and staff
 * emails, so a template saved on one side always validates on the other.
 *
 * Links and images must be http(s), a site path ("/policies"), or a
 * {{placeholder}} filled at send time — never javascript: or data: URLs,
 * which the renderer would otherwise escape but still emit.
 */
import { z } from "zod";

const safeUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (v) => !v || /^https?:\/\//i.test(v) || /^\/(?!\/)/.test(v) || /^\{\{\w+\}\}/.test(v),
    "Links and images must start with https:// or /",
  );

export const emailBlockSchema = z.object({
  type: z.enum(["heading", "text", "image", "button", "divider", "spacer"]),
  text: z.string().max(500).optional(),
  level: z.enum(["h1", "h2", "h3"]).optional(),
  content: z.string().max(10_000).optional(),
  url: safeUrl.optional(),
  alt: z.string().max(300).optional(),
  linkUrl: safeUrl.optional(),
  label: z.string().max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Colours must be a 6-digit hex like #004E64")
    .optional(),
  height: z.number().int().min(0).max(200).optional(),
});

export const emailBlocksSchema = z.array(emailBlockSchema).max(60);
