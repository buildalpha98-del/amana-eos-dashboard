import { z } from "zod";

/**
 * Minimal structural validation for a TipTap document JSON value. Full
 * schema would be too brittle as TipTap evolves — we only assert the
 * top-level shape and let the renderer handle unknown node types
 * defensively.
 *
 * Used by every API route that accepts or returns a stored template.
 */
export const tipTapDocSchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(z.any()).optional(),
  })
  .passthrough();

export type TipTapDocInput = z.infer<typeof tipTapDocSchema>;
