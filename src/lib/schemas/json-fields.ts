import { z } from "zod";

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export const notificationPrefsSchema = z.object({
  overdueTodos: z.boolean().optional(),
  newAssignments: z.boolean().optional(),
  complianceAlerts: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  dailyDigest: z.boolean().optional(),
}).passthrough();

export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const gettingStartedProgressSchema = z.record(z.string(), z.boolean());

export type GettingStartedProgress = z.infer<typeof gettingStartedProgressSchema>;

// ---------------------------------------------------------------------------
// EnrolmentSubmission
// ---------------------------------------------------------------------------

export const primaryParentSchema = z.object({
  firstName: z.string(),
  surname: z.string(),
  dob: z.string().optional(),
  email: z.string().optional(),
  mobile: z.string().optional(),
  address: z.string().optional(),
  relationship: z.string().optional(),
  occupation: z.string().optional(),
  workplace: z.string().optional(),
  workPhone: z.string().optional(),
  crn: z.string().optional(),
}).passthrough();

export type PrimaryParent = z.infer<typeof primaryParentSchema>;

export const enrolmentChildSchema = z.object({
  firstName: z.string(),
  surname: z.string(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  address: z.string().optional(),
  cultural: z.array(z.string()).optional(),
  school: z.string().optional(),
  yearLevel: z.string().optional(),
  crn: z.string().optional(),
  medical: z.unknown().optional(),
  dietary: z.unknown().optional(),
  bookingPrefs: z.unknown().optional(),
}).passthrough();

export type EnrolmentChild = z.infer<typeof enrolmentChildSchema>;

export const emergencyContactSchema = z.object({
  name: z.string(),
  relationship: z.string(),
  phone: z.string(),
  email: z.string().optional(),
}).passthrough();

export type EmergencyContact = z.infer<typeof emergencyContactSchema>;

export const authorisedPickupSchema = z.object({
  name: z.string(),
  relationship: z.string().optional(),
  phone: z.string().optional(),
}).passthrough();

export type AuthorisedPickup = z.infer<typeof authorisedPickupSchema>;

export const consentsSchema = z.object({
  firstAid: z.boolean().optional(),
  medication: z.boolean().optional(),
  ambulance: z.boolean().optional(),
  transport: z.boolean().optional(),
  excursions: z.boolean().optional(),
  photos: z.boolean().optional(),
  sunscreen: z.boolean().optional(),
}).passthrough();

export type Consents = z.infer<typeof consentsSchema>;

// ---------------------------------------------------------------------------
// CoworkReport
// ---------------------------------------------------------------------------

export const reportChecklistSchema = z.record(z.string(), z.boolean());

export type ReportChecklist = z.infer<typeof reportChecklistSchema>;

// ---------------------------------------------------------------------------
// EmailTemplate
// ---------------------------------------------------------------------------

export const emailBlockSchema = z.object({
  type: z.enum(["heading", "text", "image", "button", "divider", "spacer"]),
  text: z.string().optional(),
  content: z.string().optional(),
  url: z.string().optional(),
  level: z.enum(["h1", "h2", "h3"]).optional(),
}).passthrough();

export const emailBlocksSchema = z.array(emailBlockSchema);

export type EmailBlock = z.infer<typeof emailBlockSchema>;

// ---------------------------------------------------------------------------
// MarketingTask
// ---------------------------------------------------------------------------

export const subtaskSchema = z.object({
  text: z.string(),
  done: z.boolean(),
});

export const subtasksSchema = z.array(subtaskSchema);

export type Subtask = z.infer<typeof subtaskSchema>;

// ---------------------------------------------------------------------------
// Child
// ---------------------------------------------------------------------------

export const childAddressSchema = z.object({
  street: z.string().optional(),
  suburb: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
}).passthrough();

export type ChildAddress = z.infer<typeof childAddressSchema>;

// ---------------------------------------------------------------------------
// AuditReview
// ---------------------------------------------------------------------------

export const auditElementSchema = z.object({
  element: z.string(),
  rating: z.string(),
  evidence: z.string().optional(),
}).passthrough();

export const auditElementsSchema = z.array(auditElementSchema);

export type AuditElement = z.infer<typeof auditElementSchema>;

// ---------------------------------------------------------------------------
// VisionTractionOrganiser
// ---------------------------------------------------------------------------

export const sectionLabelsSchema = z.record(z.string(), z.string());

export type SectionLabels = z.infer<typeof sectionLabelsSchema>;

// ---------------------------------------------------------------------------
// PartnershipMeeting
// ---------------------------------------------------------------------------

export const actionItemSchema = z.object({
  action: z.string(),
  owner: z.string(),
  dueDate: z.string().optional(),
}).passthrough();

export const actionItemsSchema = z.array(actionItemSchema);

export type ActionItem = z.infer<typeof actionItemSchema>;

// ---------------------------------------------------------------------------
// TrendInsight
// ---------------------------------------------------------------------------

export const dataPointsSchema = z.array(z.number());

export type DataPoints = z.infer<typeof dataPointsSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse a Prisma Json? field with a Zod schema.
 * Returns the parsed value on success, or the fallback on failure.
 *
 * @example
 * ```ts
 * const prefs = parseJsonField(user.notificationPrefs, notificationPrefsSchema, {});
 * ```
 */
export function parseJsonField<T>(
  value: unknown,
  schema: z.ZodType<T>,
  fallback: T,
): T {
  if (value == null) return fallback;
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}
