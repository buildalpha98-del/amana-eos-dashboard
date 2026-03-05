import { z } from "zod";

export const createIssueSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  ownerId: z.string().optional().nullable(),
  rockId: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
  priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
});

export type CreateIssueInput = z.input<typeof createIssueSchema>;
