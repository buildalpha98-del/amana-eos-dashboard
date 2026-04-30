import { z } from "zod";

export const MTOP_OUTCOMES = [
  "Identity",
  "Community",
  "Wellbeing",
  "Learners",
  "Communicators",
] as const;

export const mtopOutcomeSchema = z.enum(MTOP_OUTCOMES);

export const createObservationSchema = z.object({
  childId: z.string().cuid(),
  title: z.string().trim().min(1).max(200),
  narrative: z.string().trim().min(1).max(20_000),
  mtopOutcomes: z.array(mtopOutcomeSchema).max(5).optional(),
  interests: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  visibleToParent: z.boolean().optional(),
  clientMutationId: z.string().uuid().optional(),
});

export const updateObservationSchema = createObservationSchema
  .omit({ childId: true, clientMutationId: true })
  .partial();

export type CreateObservationInput = z.infer<typeof createObservationSchema>;
export type UpdateObservationInput = z.infer<typeof updateObservationSchema>;
