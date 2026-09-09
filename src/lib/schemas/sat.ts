import { z } from "zod";
import {
  EVIDENCE_SLOTS,
  ELEMENT_ASSESSMENTS,
  LEGAL_ASSESSMENTS,
  IMPROVEMENT_PRIORITIES,
  IMPROVEMENT_STATUSES,
} from "@/lib/nqs-taxonomy";

/** Zod schemas for the element-level SAT/QIP document. All strict. */

export const elementPatchSchema = z
  .object({
    evidence: z
      .array(z.string().trim().max(5_000))
      .max(EVIDENCE_SLOTS)
      .optional(),
    assessment: z.enum(ELEMENT_ASSESSMENTS).optional(),
  })
  .strict()
  .refine((v) => v.evidence !== undefined || v.assessment !== undefined, {
    message: "Provide evidence and/or assessment",
  });

export const legalPatchSchema = z
  .object({
    assessment: z.enum(LEGAL_ASSESSMENTS),
  })
  .strict();

export const improvementCreateSchema = z
  .object({
    elementCode: z.string().regex(/^[1-7]\.[1-3](\.[1-3])?$/, "element or standard code"),
    issue: z.string().trim().min(1).max(5_000),
    outcomeGoal: z.string().trim().min(1).max(5_000),
    priority: z.enum(IMPROVEMENT_PRIORITIES).default("medium"),
    steps: z.string().trim().min(1).max(5_000),
    successMeasure: z.string().trim().min(1).max(5_000),
    byWhen: z.string().trim().max(200).optional(),
    progressNotes: z.string().trim().max(5_000).optional(),
    status: z.enum(IMPROVEMENT_STATUSES).default("not_started"),
  })
  .strict();

export const improvementUpdateSchema = improvementCreateSchema.partial().strict();

export type ElementPatchInput = z.infer<typeof elementPatchSchema>;
export type ImprovementCreateInput = z.infer<typeof improvementCreateSchema>;
