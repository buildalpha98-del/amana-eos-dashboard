import { z } from "zod";

export const RISK_ACTIVITY_TYPES = [
  "routine",
  "incursion",
  "excursion",
  "special",
] as const;

export const riskActivityTypeSchema = z.enum(RISK_ACTIVITY_TYPES);

export const hazardSchema = z.object({
  hazard: z.string().trim().min(1).max(200),
  likelihood: z.number().int().min(1).max(5),
  severity: z.number().int().min(1).max(5),
  controls: z.string().trim().min(1).max(500),
});

export const createRiskAssessmentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  activityType: riskActivityTypeSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  location: z.string().trim().max(200).optional(),
  hazards: z.array(hazardSchema).min(1).max(25),
  attachmentUrls: z.array(z.string().url()).max(10).optional(),
});

export const updateRiskAssessmentSchema = createRiskAssessmentSchema.partial();

export type Hazard = z.infer<typeof hazardSchema>;
export type CreateRiskAssessmentInput = z.infer<typeof createRiskAssessmentSchema>;
export type UpdateRiskAssessmentInput = z.infer<typeof updateRiskAssessmentSchema>;
