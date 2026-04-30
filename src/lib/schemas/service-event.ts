import { z } from "zod";

/**
 * ServiceEvent Zod schemas — mirror Prisma enum + model.
 *
 * Used by /api/services/[id]/events routes. Staff creating an event with
 * eventType === "excursion" triggers an extra server-side guard that requires
 * an approved RiskAssessment to exist before the row lands.
 */

export const SERVICE_EVENT_TYPES = [
  "excursion",
  "incursion",
  "public_holiday",
  "event",
  "meeting",
  "parent_engagement",
] as const;

export const serviceEventTypeSchema = z.enum(SERVICE_EVENT_TYPES);
export type ServiceEventType = z.infer<typeof serviceEventTypeSchema>;

const isoDateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const isoDateTime = z.string().datetime({ offset: true }).or(z.string().datetime());

export const createServiceEventSchema = z.object({
  eventType: serviceEventTypeSchema,
  title: z.string().trim().min(1, "Title required").max(200),
  date: isoDateOnly,
  startTime: isoDateTime.optional(),
  endTime: isoDateTime.optional(),
  notes: z.string().trim().max(2000).optional(),
  riskAssessmentId: z.string().cuid().optional(),
});
export type CreateServiceEventInput = z.infer<typeof createServiceEventSchema>;

export const updateServiceEventSchema = createServiceEventSchema.partial();
export type UpdateServiceEventInput = z.infer<typeof updateServiceEventSchema>;
