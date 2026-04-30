import { z } from "zod";

export const MEDICATION_ROUTES = [
  "oral",
  "topical",
  "inhaled",
  "injection",
  "other",
] as const;

export const medicationRouteSchema = z.enum(MEDICATION_ROUTES);

export const logDoseSchema = z
  .object({
    childId: z.string().cuid(),
    medicationName: z.string().trim().min(1).max(120),
    dose: z.string().trim().min(1).max(60),
    route: medicationRouteSchema,
    administeredAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
    witnessedById: z.string().cuid().optional().nullable(),
    parentConsentUrl: z.string().url().optional(),
    notes: z.string().trim().max(2000).optional(),
    clientMutationId: z.string().uuid(),
  })
  .superRefine((val, ctx) => {
    if (val.route === "injection" && !val.witnessedById) {
      ctx.addIssue({
        code: "custom",
        path: ["witnessedById"],
        message: "A witness is required for injection doses",
      });
    }
  });

export type LogDoseInput = z.infer<typeof logDoseSchema>;
