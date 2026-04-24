/**
 * Zod validators + TypeScript types for each section of a Centre Avatar.
 *
 * These shapes match Doc 5 exactly. Each section is stored as a JSON blob
 * on the `CentreAvatar` row; this file is the single source of truth for
 * the sub-shapes and their validation.
 *
 * Keep the schemas permissive — Akram is drafting living documents, not
 * filling precise forms. Every field is optional except pragma-required
 * identifiers (e.g., programme name in the programme mix table).
 */
import { z } from "zod";

// ============================================================
// Section 1 — Snapshot
// ============================================================

const contactBlockSchema = z
  .object({
    name: z.string().max(200).optional().nullable(),
    email: z.string().max(200).optional().nullable(),
    phone: z.string().max(100).optional().nullable(),
    method: z.string().max(200).optional().nullable(), // preferred contact method / notes
  })
  .partial();

export const snapshotSchema = z
  .object({
    centreDetails: z
      .object({
        officialName: z.string().max(300).optional().nullable(),
        shortName: z.string().max(300).optional().nullable(),
        state: z.string().max(10).optional().nullable(),
        address: z.string().max(500).optional().nullable(),
        schoolName: z.string().max(300).optional().nullable(),
        schoolType: z.string().max(100).optional().nullable(), // primary, secondary, P-12
      })
      .partial()
      .optional(),
    coordinator: z
      .object({
        name: z.string().max(200).optional().nullable(),
        email: z.string().max(200).optional().nullable(),
        phone: z.string().max(100).optional().nullable(),
        startedAt: z.string().max(50).optional().nullable(), // ISO date or year
        certifications: z.string().max(500).optional().nullable(),
        languages: z.string().max(300).optional().nullable(),
        strengths: z.string().max(2000).optional().nullable(),
        supportNeeds: z.string().max(2000).optional().nullable(),
      })
      .partial()
      .optional(),
    schoolContacts: z
      .object({
        principal: contactBlockSchema.optional(),
        marketingCoord: contactBlockSchema.optional(),
        adminLead: contactBlockSchema.optional(),
        newsletterEditor: contactBlockSchema.optional(),
        communityLiaison: contactBlockSchema.optional(),
      })
      .partial()
      .optional(),
    schoolCultureNotes: z.string().max(5000).optional().nullable(),
    numbers: z
      .object({
        totalSchoolStudents: z.number().int().min(0).optional().nullable(),
        ascEnrolments: z.number().int().min(0).optional().nullable(),
        penetrationRate: z.number().min(0).max(1).optional().nullable(),
        waitlist: z.number().int().min(0).optional().nullable(),
        averageAttendance: z.number().int().min(0).optional().nullable(),
      })
      .partial()
      .optional(),
    parentDrivers: z.array(z.string().max(100)).max(20).optional(),
    programmeFocus: z.string().max(200).optional().nullable(),
  })
  .partial();

export type Snapshot = z.infer<typeof snapshotSchema>;

// ============================================================
// Section 2 — Parent Avatar
// ============================================================

export const parentAvatarSchema = z
  .object({
    demographics: z
      .object({
        ageRange: z.string().max(100).optional().nullable(),
        familyStructure: z.string().max(500).optional().nullable(),
        income: z.string().max(200).optional().nullable(),
        education: z.string().max(200).optional().nullable(),
        occupations: z.string().max(500).optional().nullable(),
        languages: z.string().max(300).optional().nullable(),
      })
      .partial()
      .optional(),
    psychographics: z
      .object({
        primaryConcern: z.string().max(2000).optional().nullable(),
        primaryWant: z.string().max(2000).optional().nullable(),
        topObjections: z.string().max(2000).optional().nullable(),
        enrolTrigger: z.string().max(2000).optional().nullable(),
        dealBreaker: z.string().max(2000).optional().nullable(),
      })
      .partial()
      .optional(),
    decisionMaking: z
      .object({
        whoDecides: z.string().max(500).optional().nullable(),
        influencers: z.string().max(500).optional().nullable(),
        timeline: z.string().max(500).optional().nullable(),
      })
      .partial()
      .optional(),
    commPreferences: z
      .object({
        channel: z.string().max(200).optional().nullable(),
        frequency: z.string().max(200).optional().nullable(),
        tone: z.string().max(200).optional().nullable(),
        language: z.string().max(200).optional().nullable(),
      })
      .partial()
      .optional(),
    culturalSensitivities: z.string().max(5000).optional().nullable(),
    competition: z.string().max(5000).optional().nullable(),
    communityDynamics: z.string().max(5000).optional().nullable(),
  })
  .partial();

export type ParentAvatar = z.infer<typeof parentAvatarSchema>;

// ============================================================
// Section 3 — Programme Mix
// ============================================================

const programmeRowSchema = z.object({
  name: z.string().min(1).max(200),
  running: z.boolean().optional().default(false),
  attendance: z.number().int().min(0).optional().nullable(),
  capacity: z.number().int().min(0).optional().nullable(),
  status: z.string().max(200).optional().nullable(), // notes / status blurb
});

export const programmeMixSchema = z
  .object({
    whatsWorking: z.string().max(5000).optional().nullable(),
    whatsNotWorking: z.string().max(5000).optional().nullable(),
    gaps: z.string().max(5000).optional().nullable(),
    programmes: z.array(programmeRowSchema).max(30).optional(),
  })
  .partial();

export type ProgrammeMix = z.infer<typeof programmeMixSchema>;

// ============================================================
// Section 8 — Asset Library
// ============================================================

export const assetLibrarySchema = z
  .object({
    photoLibrary: z.string().max(2000).optional().nullable(),
    videoLibrary: z.string().max(2000).optional().nullable(),
    testimonials: z.string().max(2000).optional().nullable(),
    parentConsentList: z.string().max(2000).optional().nullable(),
    staffPhotos: z.string().max(2000).optional().nullable(),
    newsletterScreenshots: z.string().max(2000).optional().nullable(),
    activationMedia: z.string().max(2000).optional().nullable(),
    assetGaps: z.string().max(5000).optional().nullable(),
  })
  .partial();

export type AssetLibrary = z.infer<typeof assetLibrarySchema>;

// ============================================================
// Section dispatcher
// ============================================================

export const SECTION_KEYS = ["snapshot", "parentAvatar", "programmeMix", "assetLibrary"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const sectionSchemas = {
  snapshot: snapshotSchema,
  parentAvatar: parentAvatarSchema,
  programmeMix: programmeMixSchema,
  assetLibrary: assetLibrarySchema,
} as const;

export const SECTION_LABELS: Record<SectionKey, string> = {
  snapshot: "Centre snapshot",
  parentAvatar: "Parent avatar",
  programmeMix: "Programme mix",
  assetLibrary: "Asset library",
};
