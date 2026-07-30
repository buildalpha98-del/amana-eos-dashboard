/**
 * Shape and completeness rules for the in-portal enrolment draft.
 *
 * Kept as a pure module (no React, no Prisma) for two reasons: the wizard
 * needs it to decide when "Next" unlocks, and the submit route needs the
 * SAME rules to decide whether a draft may become a submission. Two copies
 * of "is this complete" is how a form ends up letting a half-filled
 * enrolment through the back door.
 *
 * 2026-07-30 revision, per Daniel. These rules were deliberately aligned
 * with the public form's validateStep() in src/components/enrol/types.ts —
 * that form already encoded the same policy (CRN mandatory, secondary
 * carer mandatory unless a court order applies, birth certificate and
 * immunisation record mandatory), and having the portal be more lenient
 * than the public form would just move the compliance gap rather than
 * close it.
 */

import { ccsAnswered, type CcsApplied, type CcsApproved } from "@/lib/enrol-ccs";

/** Where enrolment questions go. Never the director's personal address. */
export const ENROLMENTS_EMAIL = "enrolments@amanaoshc.com.au";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface DraftUpload {
  type: string;
  filename: string;
  url: string;
}

export interface DraftMe {
  firstName?: string;
  surname?: string;
  mobile?: string;
  dob?: string;
  gender?: string;
  languageSpoken?: string;
  /**
   * MANDATORY for the primary carer. Daniel, 2026-07-30: "the CRN for the
   * parent, especially the primary carer, is not optional — they must give
   * it." Without it we can't submit a CCS claim, so an enrolment that
   * lacks one is an invoice the family didn't expect.
   */
  crn?: string;
  street?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  isLegalCarer?: boolean;
  ccsApproved?: CcsApproved;
  ccsApplied?: CcsApplied;
}

export interface DraftChild {
  firstName?: string;
  surname?: string;
  dob?: string;
  gender?: string;
  schoolName?: string;
  /**
   * Free text, NOT a year-level dropdown. Daniel: parents should enter the
   * child's actual classroom code (e.g. "D.G1Y") — that's what the schools
   * use on the ground, and it's what educators need at pickup.
   */
  classroom?: string;
  crn?: string;
  countryOfBirth?: string;
  culturalBackground?: string;
  medicareNumber?: string;
  /** MM/YYYY — cards only ever show month and year. */
  medicareExpiry?: string;

  // ── Health screening (mirrors the NQF-standard questions) ──
  anaphylaxis?: boolean | null;
  allergies?: boolean | null;
  asthma?: boolean | null;
  otherCondition?: boolean | null;
  dietaryRestrictions?: boolean | null;
  /** Permission to administer paracetamol if no carer can be reached. */
  paracetamol?: boolean | null;

  anaphylaxisDetail?: string;
  allergiesDetail?: string;
  asthmaDetail?: string;
  otherConditionDetail?: string;
  dietaryDetail?: string;
  medications?: string;

  doctorName?: string;
  doctorPhone?: string;

  /** Birth certificate, immunisation record, photo, action plans. */
  uploads?: DraftUpload[];
}

/**
 * An emergency contact, with the authorisations the Regulations expect us
 * to record per person rather than per family.
 */
export interface DraftEmergencyContact {
  name?: string;
  relationship?: string;
  phone?: string;
  consentTransport?: boolean | null;
  consentMedical?: boolean | null;
  consentOffPremises?: boolean | null;
  consentAmbulance?: boolean | null;
  consentOutings?: boolean | null;
  consentNotify?: boolean | null;
  /**
   * Replaces the old separate "authorised for pickup" list. Daniel: fold it
   * into the emergency contact rather than making families enter the same
   * person twice.
   */
  consentPickup?: boolean | null;
}

export interface DraftSecondaryParent {
  firstName?: string;
  surname?: string;
  email?: string;
  mobile?: string;
  relationship?: string;
}

export interface DraftContacts {
  secondaryParent?: DraftSecondaryParent;
  /** ONE is required. More are welcome; a second is never forced. */
  emergency?: DraftEmergencyContact[];
  courtOrders?: boolean | null;
  courtOrderUploads?: DraftUpload[];
}

export interface DraftBilling {
  method?: "credit_card" | "bank_account" | "";
  startDate?: string;
  bookingType?: "permanent" | "casual" | "";
  /**
   * Which sessions, by program. Keyed by SESSION_ROWS[].key.
   *
   * A day-based row (before/after school care) stores the weekday names;
   * a whole-of-session row (Rise and Shine, Amana Afternoons, Holiday
   * Quest) stores `["yes"]` when ticked. One shape for both keeps the
   * autosaved draft simple and the rendering uniform.
   */
  sessions?: Record<string, string[]>;
  /** @deprecated superseded by `sessions`; kept so old drafts still read. */
  days?: string[];
}

/**
 * The booking grid, mirroring the layout Daniel supplied: a program name
 * on the left, and either the five weekdays or a single session time on
 * the right. Editing a row is one click, which is the whole point.
 */
export const SESSION_ROWS: {
  key: string;
  label: string;
  help?: string;
  /** Weekday checkboxes when true, a single time checkbox when false. */
  perDay: boolean;
  /** Shown as the single option's label when `perDay` is false. */
  time?: string;
}[] = [
  {
    key: "beforeSchool",
    label: "Before school care",
    help: "We collect your child from home-room or the school gate and take them to the service before the school day starts.",
    perDay: true,
  },
  { key: "riseAndShine", label: "Rise and Shine", perDay: false, time: "7–8:30am" },
  {
    key: "afterSchool",
    label: "After school care",
    help: "We collect your child at the end of the school day and care for them until you arrive.",
    perDay: true,
  },
  {
    key: "amanaAfternoons",
    label: "Amana Afternoons",
    perDay: false,
    time: "3:30–6:30pm",
  },
  { key: "holidayQuest", label: "Holiday Quest", perDay: false, time: "7am–6pm" },
];

export interface DraftAgreement {
  firstAid?: boolean | null;
  medication?: boolean | null;
  ambulance?: boolean | null;
  transport?: boolean | null;
  excursions?: boolean | null;
  photos?: boolean | null;
  sunscreen?: boolean | null;
  termsAccepted?: boolean;
  privacyAccepted?: boolean;
  debitAgreement?: boolean;
  signature?: string;
  referralSource?: string;
}

export interface EnrolDraft {
  me?: DraftMe;
  children?: DraftChild[];
  contacts?: DraftContacts;
  billing?: DraftBilling;
  agreement?: DraftAgreement;
}

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

/**
 * Relationship options for an EMERGENCY contact.
 *
 * "Mum" and "Dad" are deliberately absent. Daniel: without that, parents
 * read the field as another place to put themselves — and an emergency
 * contact who is the parent we already can't reach is no contact at all.
 */
export const EMERGENCY_RELATIONSHIP_OPTIONS = [
  "Uncle",
  "Auntie",
  "Grandparent",
  "Other Relative",
  "Family Friend",
  "Neighbour",
  "Guardian",
  "Other",
] as const;

/** The per-contact authorisations, in the order they're asked. */
export const EMERGENCY_CONSENTS = [
  {
    key: "consentTransport" as const,
    label:
      "Can this person be contacted to give consent for educators to transport the child or arrange transportation of the child?",
  },
  {
    key: "consentMedical" as const,
    label:
      "Can this person be contacted to give consent for medical treatment, or to authorise a Nominated Supervisor or educator to administer medication to the child, in the event that you cannot be contacted?",
  },
  {
    key: "consentOffPremises" as const,
    label:
      "Can this person be contacted to give consent for educators to take the child outside the Service's premises in the event that you cannot be contacted?",
  },
  {
    key: "consentAmbulance" as const,
    label:
      "Can this person be contacted to give consent to the transportation of the child by an ambulance service?",
  },
  {
    key: "consentOutings" as const,
    label:
      "Can this person give authorisation for the Service to take the child on regular outings?",
  },
  {
    key: "consentNotify" as const,
    label:
      "This person can be contacted and notified of an emergency involving the child if any parent or carer cannot be immediately contacted.",
  },
  {
    key: "consentPickup" as const,
    label:
      "This person has been given permission by a parent or carer to drop off and collect the child from the service.",
  },
];

/** Documents every child needs before we can accept them. */
export const REQUIRED_CHILD_DOCUMENTS = [
  { type: "birth_certificate", label: "Birth certificate" },
  { type: "immunisation_record", label: "Immunisation record" },
] as const;

export const OPTIONAL_CHILD_DOCUMENTS = [
  { type: "child_photo", label: "Photo of your child" },
  { type: "medical_action_plan", label: "Medical / action plan" },
] as const;

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

const filled = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : Boolean(v);

/** Loose comparison for "is this the same person?" checks. */
const normName = (s: string | undefined): string =>
  (s ?? "").toLowerCase().replace(/[^a-z]/g, "");
const normPhone = (s: string | undefined): string =>
  (s ?? "").replace(/\D/g, "");

export function meComplete(me: DraftMe | undefined): boolean {
  if (!me) return false;
  return (
    filled(me.firstName) &&
    filled(me.surname) &&
    filled(me.mobile) &&
    filled(me.dob) &&
    filled(me.street) &&
    filled(me.suburb) &&
    filled(me.crn) &&
    me.isLegalCarer === true &&
    ccsAnswered({ approved: me.ccsApproved ?? null, applied: me.ccsApplied ?? null })
  );
}

/**
 * Medicare expiry, as MM/YYYY — that's all the card prints.
 *
 * Accepts a two-digit month 01-12 and a plausible four-digit year. Does
 * NOT reject a past date: a family renewing their card shouldn't be
 * locked out of enrolling, and staff can see the date for themselves.
 */
export function medicareExpiryValid(v: string | undefined): boolean {
  const m = /^(\d{2})\/(\d{4})$/.exec((v ?? "").trim());
  if (!m) return false;
  const month = Number(m[1]);
  const year = Number(m[2]);
  return month >= 1 && month <= 12 && year >= 2000 && year <= 2100;
}

/** Format keystrokes into MM/YYYY as the parent types. */
export function formatMedicareExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Has this child's document `type` been uploaded? */
export function hasUpload(c: DraftChild | undefined, type: string): boolean {
  return (c?.uploads ?? []).some((u) => u.type === type && filled(u.url));
}

export function childComplete(c: DraftChild | undefined): boolean {
  if (!c) return false;

  // Every screening question must be an explicit yes or no. A blank is not
  // a "no" — for anaphylaxis that difference is the whole point.
  const screeningAnswered =
    typeof c.anaphylaxis === "boolean" &&
    typeof c.allergies === "boolean" &&
    typeof c.asthma === "boolean" &&
    typeof c.otherCondition === "boolean" &&
    typeof c.dietaryRestrictions === "boolean" &&
    typeof c.paracetamol === "boolean";

  // Both mandatory (Daniel, 2026-07-30). The expiry is format-checked as
  // well as present: "2030" or "5/30" would be accepted as "filled" and
  // then be useless to the person reading the record.
  const medicare =
    filled(c.medicareNumber) && medicareExpiryValid(c.medicareExpiry);

  const documents = REQUIRED_CHILD_DOCUMENTS.every((d) => hasUpload(c, d.type));

  return (
    filled(c.firstName) &&
    filled(c.surname) &&
    filled(c.dob) &&
    filled(c.schoolName) &&
    filled(c.classroom) &&
    screeningAnswered &&
    medicare &&
    documents
  );
}

export function childrenComplete(children: DraftChild[] | undefined): boolean {
  return Array.isArray(children) && children.length > 0 && children.every(childComplete);
}

export function emergencyContactComplete(
  c: DraftEmergencyContact | undefined,
): boolean {
  if (!c) return false;
  const consentsAnswered = EMERGENCY_CONSENTS.every(
    (q) => typeof c[q.key] === "boolean",
  );
  return (
    filled(c.name) && filled(c.relationship) && filled(c.phone) && consentsAnswered
  );
}

export function secondaryParentFilled(
  sp: DraftSecondaryParent | undefined,
): boolean {
  return Boolean(
    sp && (filled(sp.firstName) || filled(sp.surname) || filled(sp.email) || filled(sp.mobile)),
  );
}

function secondaryParentValid(sp: DraftSecondaryParent | undefined): boolean {
  return Boolean(sp && filled(sp.firstName) && filled(sp.surname) && filled(sp.mobile));
}

/**
 * Contacts step.
 *
 * Takes the WHOLE draft, not just `contacts`, because an emergency contact
 * has to be checked against the primary carer — which lives on `me`.
 */
export function contactsComplete(d: EnrolDraft): boolean {
  const contacts = d.contacts ?? {};
  const me = d.me ?? {};
  const sp = contacts.secondaryParent;

  // Court orders must be answered either way — it's the switch that
  // decides whether a second carer is mandatory.
  if (typeof contacts.courtOrders !== "boolean") return false;

  if (contacts.courtOrders === false) {
    // No court order → a second carer is required. Daniel: "they should
    // always add it when possible, so that should be a must."
    if (!secondaryParentValid(sp)) return false;
  } else {
    // Court order → the second carer is excused, but a half-filled one is
    // still an error rather than a silent partial record.
    if (secondaryParentFilled(sp) && !secondaryParentValid(sp)) return false;
    if ((contacts.courtOrderUploads ?? []).length === 0) return false;
  }

  const valid = (contacts.emergency ?? []).filter(emergencyContactComplete);
  // ONE is enough. Daniel was explicit: don't force a second.
  if (valid.length < 1) return false;

  // An emergency contact who IS the primary or secondary carer defeats the
  // purpose — they're the people we already couldn't reach.
  const carerPhones = new Set(
    [normPhone(me.mobile), normPhone(sp?.mobile)].filter(Boolean),
  );
  const carerNames = new Set(
    [
      normName(`${me.firstName ?? ""}${me.surname ?? ""}`),
      normName(`${sp?.firstName ?? ""}${sp?.surname ?? ""}`),
    ].filter(Boolean),
  );

  return valid.every(
    (c) =>
      !carerPhones.has(normPhone(c.phone)) && !carerNames.has(normName(c.name)),
  );
}

/** Why the contacts step is blocked, for showing the parent. */
export function contactsBlocker(d: EnrolDraft): string | null {
  if (contactsComplete(d)) return null;
  const contacts = d.contacts ?? {};
  const me = d.me ?? {};
  const sp = contacts.secondaryParent;

  if (typeof contacts.courtOrders !== "boolean") {
    return "Please answer whether any court orders or parenting plans apply.";
  }
  if (contacts.courtOrders === false && !secondaryParentValid(sp)) {
    return "Please add a second parent or carer — first name, last name and mobile. If a court order means you can't, tick the court order question above.";
  }
  if (contacts.courtOrders === true) {
    if (secondaryParentFilled(sp) && !secondaryParentValid(sp)) {
      return "Please complete the second carer's first name, last name and mobile, or clear those fields.";
    }
    if ((contacts.courtOrderUploads ?? []).length === 0) {
      return "Please upload a copy of the court order or parenting plan.";
    }
  }

  const all = contacts.emergency ?? [];
  const valid = all.filter(emergencyContactComplete);
  if (valid.length < 1) {
    return all.length === 0
      ? "Please add one emergency contact."
      : "Please complete the emergency contact's name, relationship, phone, and answer each of the authorisation questions.";
  }

  const carerPhones = new Set(
    [normPhone(me.mobile), normPhone(sp?.mobile)].filter(Boolean),
  );
  const carerNames = new Set(
    [
      normName(`${me.firstName ?? ""}${me.surname ?? ""}`),
      normName(`${sp?.firstName ?? ""}${sp?.surname ?? ""}`),
    ].filter(Boolean),
  );
  if (
    valid.some(
      (c) => carerPhones.has(normPhone(c.phone)) || carerNames.has(normName(c.name)),
    )
  ) {
    return "Your emergency contact must be someone other than you or the second carer.";
  }
  return "Please complete this step.";
}

/** Has this family picked at least one session anywhere on the grid? */
export function anySessionSelected(b: DraftBilling | undefined): boolean {
  const sessions = b?.sessions ?? {};
  if (SESSION_ROWS.some((r) => (sessions[r.key] ?? []).length > 0)) return true;
  // Drafts saved before the grid existed stored a flat day list.
  return (b?.days ?? []).length > 0;
}

export function billingComplete(b: DraftBilling | undefined): boolean {
  if (!b) return false;
  if (!filled(b.startDate) || !filled(b.bookingType)) return false;
  // Whatever the booking type, we need to know WHICH sessions they want —
  // a casual booking with nothing ticked tells staff nothing.
  return anySessionSelected(b);
}

export function agreementComplete(a: DraftAgreement | undefined): boolean {
  if (!a) return false;
  const consents: (keyof DraftAgreement)[] = [
    "firstAid",
    "medication",
    "ambulance",
    "transport",
    "excursions",
    "photos",
    "sunscreen",
  ];
  // Every consent must be an explicit yes OR no. An unanswered consent is
  // not the same as a "no" — staff need to know which one they're looking at.
  const allAnswered = consents.every((k) => typeof a[k] === "boolean");
  return (
    allAnswered &&
    a.termsAccepted === true &&
    a.privacyAccepted === true &&
    filled(a.signature)
  );
}

/** 0-indexed, matching ENROL_STEPS. */
export function stepComplete(step: number, d: EnrolDraft): boolean {
  switch (step) {
    case 0:
      return meComplete(d.me);
    case 1:
      return childrenComplete(d.children);
    case 2:
      return contactsComplete(d);
    case 3:
      return billingComplete(d.billing);
    case 4:
      return agreementComplete(d.agreement);
    default:
      return false;
  }
}

/** Every step — the gate on submission. */
export function draftSubmittable(d: EnrolDraft): boolean {
  return [0, 1, 2, 3, 4].every((s) => stepComplete(s, d));
}

/** First incomplete step, or null when the whole draft is done. */
export function firstIncompleteStep(d: EnrolDraft): number | null {
  for (const s of [0, 1, 2, 3, 4]) {
    if (!stepComplete(s, d)) return s;
  }
  return null;
}
