import { z } from "zod";

export const serviceAccessLevelSchema = z.enum([
  "view_only",
  "contributor",
  "admin",
]);

export const serviceMembershipStatusSchema = z.enum(["active", "inactive"]);

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

export const createServiceStaffSchema = z.object({
  userId: z.string().min(1),
  roleAtService: z.string().min(1).max(50),
  accessLevel: serviceAccessLevelSchema,
  startDate: isoDateSchema,
});

export const updateServiceStaffSchema = z.object({
  roleAtService: z.string().min(1).max(50).optional(),
  accessLevel: serviceAccessLevelSchema.optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.nullable().optional(),
  status: serviceMembershipStatusSchema.optional(),
});

export const bulkUserMembershipsSchema = z.object({
  items: z
    .array(
      z.object({
        serviceId: z.string().min(1),
        roleAtService: z.string().min(1).max(50),
        accessLevel: serviceAccessLevelSchema,
        startDate: isoDateSchema,
      }),
    )
    .min(1)
    .max(50),
});
