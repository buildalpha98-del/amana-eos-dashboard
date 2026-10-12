import { z } from "zod";
import { Prisma, Role, StaffUpdateType } from "@prisma/client";
import { emailBlocksSchema } from "@/lib/email-block-schema";
import { blocksSummary } from "@/lib/staff-email-design";
import type { EmailBlock } from "@/lib/email-marketing-layout";
import { ApiError } from "@/lib/api-error";

/** What an admin (or Cowork) can write on a staff email. */
export const staffUpdateFieldsSchema = z.object({
  type: z.nativeEnum(StaffUpdateType),
  title: z.string().trim().min(1, "Give it a title.").max(160),
  // Optional for a designed email (blocks) — see withContent().
  body: z.string().trim().max(5000).default(""),
  linkUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => !v || /^https?:\/\//i.test(v) || v.startsWith("/"), "Links must start with https:// or /")
    .optional()
    .nullable(),
  linkLabel: z.string().trim().max(60).optional().nullable(),
  audienceRoles: z.array(z.nativeEnum(Role)).max(20).default([]),
  audienceServiceIds: z.array(z.string().min(1)).max(50).default([]),
  urgent: z.boolean().default(false),
  /** Set = a designed email from the template library; null = plain update. */
  blocks: emailBlocksSchema.nullable().optional(),
});

/**
 * A staff email needs a message OR designed blocks. For a designed one the
 * plain `body` becomes a text summary of the blocks (card preview, Cowork
 * reads, notification). Returns Prisma-ready data (`blocks` → DbNull).
 */
export function withContent<T extends { body?: string; blocks?: EmailBlock[] | null }>(
  fields: T,
  existing?: { body: string; blocks: unknown },
) {
  const blocks = fields.blocks !== undefined ? fields.blocks : ((existing?.blocks as EmailBlock[] | null) ?? null);
  const designed = Array.isArray(blocks) && blocks.length > 0;
  let body = fields.body !== undefined ? fields.body : (existing?.body ?? "");
  if (designed && !body.trim()) body = blocksSummary(blocks!) || "(Designed email)";
  if (!designed && !body.trim()) throw ApiError.badRequest("Write the message.");
  const { blocks: _b, ...rest } = fields;
  return {
    ...rest,
    body,
    ...(fields.blocks !== undefined || designed
      ? { blocks: designed ? (blocks as unknown as Prisma.InputJsonValue) : Prisma.DbNull }
      : {}),
  };
}
