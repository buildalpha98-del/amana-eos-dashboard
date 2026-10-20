/**
 * Staff forms in the compliance section (Daniel, 20 Oct 2026):
 *
 *   staff_record        — everyone: the Staff Record (reg 145/146 details).
 *   responsible_person  — only people with the "Responsible Person" position:
 *                         the Responsible Person offer & acceptance, with
 *                         fit-and-proper, compliance-history and prohibition
 *                         declarations. Countersigned by the centre's
 *                         coordinator or a State Manager as nominated
 *                         supervisor, who also ticks the documents viewed.
 *
 * Visibility is the same as certificates (canAccessStaffProfile): the
 * person, their centre's coordinator, and the admin tier.
 */
import { z } from "zod";
import type { StaffFormType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessStaffProfile } from "@/lib/staff-access";

export const STAFF_FORM_TYPES = ["staff_record", "responsible_person"] as const;

export const STAFF_FORM_TITLES: Record<StaffFormType, string> = {
  staff_record: "Staff Record",
  responsible_person: "Responsible Person — offer and acceptance",
};

/** The position that makes someone fill in the Responsible Person form. */
export const RESPONSIBLE_PERSON_POSITION = "responsible_person";

const text = (max = 300) => z.string().trim().max(max);
const req = (label: string, max = 300) => text(max).min(1, `${label} is required`);
const yesNo = z.enum(["yes", "no"], { message: "Answer yes or no" });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

// ── Staff Record ─────────────────────────────────────────────

export const staffRecordSchema = z.object({
  fullName: req("Full name", 120),
  dateOfBirth: isoDate,
  address: req("Address"),
  qualifications: req("Qualifications or course enrolled in", 2000),
  qualificationCopiesAttached: z.boolean(),
  otherTraining: text(2000),
  trainingCopiesAttached: z.boolean(),
  wwccNumber: req("Working with Children Check number", 60),
  wwccExpiry: isoDate,
  emergencyName: req("Emergency contact name", 120),
  emergencyRelationship: req("Emergency contact relationship", 60),
  emergencyPhone: req("Emergency contact phone", 40),
});
export type StaffRecordData = z.infer<typeof staffRecordSchema>;

// ── Responsible Person ───────────────────────────────────────

const detail = text(2000);
export const responsiblePersonSchema = z
  .object({
    fullName: req("Full name", 120),
    dateOfBirth: isoDate,
    address: req("Address"),
    mobile: req("Mobile phone number", 40),
    email: z.string().trim().email("Enter a valid email"),
    otherName: yesNo,
    otherFamilyName: text(120),
    otherGivenName: text(120),
    wwccNumber: req("Working with Children Check number", 60),
    wwccExpiry: isoDate,
    childProtectionCourseNumber: text(120),
    childSafetyTrainingDate: z.union([isoDate, z.literal("")]),
    fpConvictions: yesNo,
    fpBankruptcy: yesNo,
    fpDirectorAdministration: yesNo,
    fpConflictOfInterest: yesNo,
    fpOtherInfo: detail,
    chDisciplinary: yesNo,
    chDisciplinaryDetails: detail,
    chProhibitionNotice: yesNo,
    chProhibitionNoticeDetails: detail,
    chLicenceRefused: yesNo,
    chLicenceRefusedDetails: detail,
    pnCurrentProhibition: yesNo,
    pnCurrentProhibitionDetails: detail,
    pnRestricted: yesNo,
    pnRestrictedDetails: detail,
    declarationAccepted: z.literal(true, { message: "Tick the declaration to submit" }),
  })
  .superRefine((v, ctx) => {
    if (v.otherName === "yes" && !v.otherFamilyName && !v.otherGivenName)
      ctx.addIssue({ code: "custom", path: ["otherFamilyName"], message: "Give the other name you've been known by" });
    const pairs: [keyof typeof v, keyof typeof v][] = [
      ["chDisciplinary", "chDisciplinaryDetails"],
      ["chProhibitionNotice", "chProhibitionNoticeDetails"],
      ["chLicenceRefused", "chLicenceRefusedDetails"],
      ["pnCurrentProhibition", "pnCurrentProhibitionDetails"],
      ["pnRestricted", "pnRestrictedDetails"],
    ];
    for (const [q, d] of pairs)
      if (v[q] === "yes" && !String(v[d] ?? "").trim())
        ctx.addIssue({ code: "custom", path: [d], message: "Please give details" });
  });
export type ResponsiblePersonData = z.infer<typeof responsiblePersonSchema>;

/** Ticked by the supervisor when countersigning ("documents collected and viewed by management"). */
export const RP_DOCUMENTS = [
  { key: "birthCertificate", label: "Birth certificate" },
  { key: "citizenshipCertificate", label: "Citizenship certificate (if required)" },
  { key: "passport", label: "Current passport" },
  { key: "resume", label: "Resume or CV" },
  { key: "references", label: "Written references" },
  { key: "qualifications", label: "Transcripts or certificates of approved early childhood qualifications" },
  { key: "criminalHistory", label: "Criminal history check" },
] as const;

export const signatureSchema = z.string().startsWith("data:image/", "Sign in the box").max(500_000);

export const saveFormSchema = z
  .object({
    /** Draft answers — saved as-is, validated only on submit. */
    data: z.record(z.string(), z.unknown()),
    submit: z.boolean().optional(),
    signature: signatureSchema.optional(),
  })
  .strict();

export const countersignSchema = z
  .object({
    signature: signatureSchema,
    documentsViewed: z.array(z.enum(RP_DOCUMENTS.map((d) => d.key) as [string, ...string[]])).max(RP_DOCUMENTS.length),
  })
  .strict();

export function submitSchemaFor(type: StaffFormType) {
  return type === "staff_record" ? staffRecordSchema : responsiblePersonSchema;
}

// ── Who can do what ──────────────────────────────────────────

export async function canViewStaffForms(
  viewer: { id: string; role: string | null },
  target: { id: string; serviceId: string | null },
): Promise<boolean> {
  return canAccessStaffProfile(viewer.id, viewer.role, target);
}

/**
 * Nominated supervisor: the person's centre coordinator (a Director of
 * Service whose centres include theirs) or a State Manager. Never yourself.
 */
export async function canCountersignStaffForm(
  viewer: { id: string; role: string | null },
  target: { id: string; serviceId: string | null },
): Promise<boolean> {
  if (viewer.id === target.id) return false;
  if (viewer.role === "head_office") return true;
  if (viewer.role !== "member") return false;
  return canAccessStaffProfile(viewer.id, viewer.role, target);
}

export function formsFor(positions: readonly string[] | null | undefined): StaffFormType[] {
  return Array.isArray(positions) && positions.includes(RESPONSIBLE_PERSON_POSITION)
    ? ["staff_record", "responsible_person"]
    : ["staff_record"];
}

/** Draft / awaiting supervisor / complete. */
export function formStatus(f: {
  type: StaffFormType;
  submittedAt: Date | null;
  supervisorSignedAt: Date | null;
} | null): "not_started" | "draft" | "awaiting_supervisor" | "complete" {
  if (!f) return "not_started";
  if (!f.submittedAt) return "draft";
  if (f.type === "responsible_person" && !f.supervisorSignedAt) return "awaiting_supervisor";
  return "complete";
}

// ── Pre-fill from what we already hold ───────────────────────

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export async function staffFormPrefill(userId: string): Promise<Record<string, unknown>> {
  const [user, contact, wwcc, quals, training] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        phone: true,
        dateOfBirth: true,
        addressStreet: true,
        addressSuburb: true,
        addressState: true,
        addressPostcode: true,
      },
    }),
    prisma.emergencyContact.findFirst({
      where: { userId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { name: true, phone: true, relationship: true },
    }),
    prisma.complianceCertificate.findFirst({
      where: { userId, type: "wwcc", supersededAt: null },
      orderBy: { createdAt: "desc" },
      select: { expiryDate: true },
    }),
    prisma.staffQualification.findMany({
      where: { userId, type: { in: ["cert_iii", "diploma", "bachelor", "masters", "other"] } },
      select: { name: true, institution: true },
    }),
    prisma.complianceCertificate.findMany({
      where: { userId, supersededAt: null, type: { in: ["first_aid", "cpr", "anaphylaxis", "asthma", "child_protection", "geccko"] } },
      select: { type: true, label: true },
    }),
  ]);
  const address = [user?.addressStreet, user?.addressSuburb, user?.addressState, user?.addressPostcode]
    .filter((x) => x && x.trim())
    .join(", ");
  const trainingLabel: Record<string, string> = {
    first_aid: "First Aid",
    cpr: "CPR",
    anaphylaxis: "Anaphylaxis",
    asthma: "Asthma",
    child_protection: "Child Protection",
    geccko: "GECCKO child safe training",
  };
  return {
    fullName: user?.name ?? "",
    dateOfBirth: ymd(user?.dateOfBirth),
    address,
    mobile: user?.phone ?? "",
    email: user?.email ?? "",
    wwccExpiry: ymd(wwcc?.expiryDate),
    qualifications: quals.map((q) => [q.name, q.institution].filter(Boolean).join(", ")).join("\n"),
    otherTraining: [...new Set(training.map((t) => t.label || trainingLabel[t.type] || t.type))].join(", "),
    emergencyName: contact?.name ?? "",
    emergencyRelationship: contact?.relationship ?? "",
    emergencyPhone: contact?.phone ?? "",
  };
}
