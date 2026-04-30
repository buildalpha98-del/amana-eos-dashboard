import { z } from "zod";

export const createHandoverSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  mentionedUserIds: z.array(z.string().cuid()).max(20).optional(),
});

export type CreateHandoverInput = z.infer<typeof createHandoverSchema>;
