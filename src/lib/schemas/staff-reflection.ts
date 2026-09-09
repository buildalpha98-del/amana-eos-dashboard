import { z } from "zod";

/**
 * StaffReflection Zod schemas.
 * Uses model name `StaffReflection` (renamed from spec's EducatorReflection
 * to avoid clashing with a legacy Cowork ingest model).
 */

export const REFLECTION_TYPES = ["daily", "weekly", "monthly", "critical", "team"] as const;
export const REFLECTION_MOODS = ["positive", "neutral", "concern"] as const;
export const MTOP_OUTCOMES = [
  "Identity",
  "Community",
  "Wellbeing",
  "Learners",
  "Communicators",
] as const;

export const reflectionTypeSchema = z.enum(REFLECTION_TYPES);
export const reflectionMoodSchema = z.enum(REFLECTION_MOODS);
export const mtopOutcomeSchema = z.enum(MTOP_OUTCOMES);

export const createReflectionSchema = z.object({
  type: reflectionTypeSchema,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20_000),
  qualityAreas: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  linkedObservationIds: z.array(z.string().cuid()).max(50).optional(),
  mood: reflectionMoodSchema.optional(),
  mtopOutcomes: z.array(mtopOutcomeSchema).max(5).optional(),
  /// Daily-type fan-out: children to create LearningObservations for.
  childIds: z.array(z.string().cuid()).max(50).optional(),
  /// Daily-type fan-out: also publish a ParentPost.
  shareWithParents: z.boolean().optional(),
  clientMutationId: z.string().uuid().optional(),
});

// No retroactive re-fan-out on edit: childIds/shareWithParents are create-only.
export const updateReflectionSchema = createReflectionSchema
  .omit({ clientMutationId: true, childIds: true, shareWithParents: true })
  .partial();

export type CreateReflectionInput = z.infer<typeof createReflectionSchema>;
export type UpdateReflectionInput = z.infer<typeof updateReflectionSchema>;
