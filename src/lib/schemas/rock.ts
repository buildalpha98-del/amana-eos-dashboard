import { z } from "zod";

export const createRockSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  ownerId: z.string().min(1, "Owner is required"),
  quarter: z.string().min(1, "Quarter is required"),
  priority: z.enum(["critical", "high", "medium"]).default("medium"),
  rockType: z.enum(["company", "personal"]).default("personal"),
  oneYearGoalId: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
});

export type CreateRockInput = z.input<typeof createRockSchema>;
