import { z } from "zod";
import { Role, StaffUpdateType } from "@prisma/client";

/** What an admin (or Cowork) can write on a staff email. */
export const staffUpdateFieldsSchema = z.object({
  type: z.nativeEnum(StaffUpdateType),
  title: z.string().trim().min(1, "Give it a title.").max(160),
  body: z.string().trim().min(1, "Write the message.").max(5000),
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
});
