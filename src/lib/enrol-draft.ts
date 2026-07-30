/**
 * Shape and completeness rules for the in-portal enrolment draft.
 *
 * Kept as a pure module (no React, no Prisma) for two reasons: the wizard
 * needs it to decide when "Next" unlocks, and the submit route needs the
 * SAME rules to decide whether a draft may become a submission. Two copies
 * of "is this complete" is how a form ends up letting a half-filled
 * enrolment through the back door.
 */

import { ccsAnswered, type CcsApplied, type CcsApproved } from "@/lib/enrol-ccs";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface DraftMe {
  firstName?: string;
  surname?: string;
  mobile?: string;
  dob?: string;
  gender?: string;
  languageSpoken?: string;
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
  yearLevel?: string;
  crn?: string;
  countryOfBirth?: string;
  culturalBackground?: string;
  /** Free text. Empty means "none" only once `medicalNone` is ticked. */
  allergies?: string;
  conditions?: string;
  medications?: string;
  dietary?: string;
  /**
   * Explicit "nothing to declare". Without this we can't tell a parent who
   * has no allergies apart from one who skipped the question — and for
   * anaphylaxis that difference matters.
   */
  medicalNone?: boolean;
  hasMedicalPlan?: boolean | null;
  doctorName?: string;
  doctorPhone?: string;
  medicareNumber?: string;
}

export interface DraftContact {
  name?: string;
  relationship?: string;
  phone?: string;
  email?: string;
}

export interface DraftContacts {
  secondaryParent?: {
    firstName?: string;
    surname?: string;
    email?: string;
    mobile?: string;
    relationship?: string;
  };
  /** At least two — the regulator expects two reachable people. */
  emergency?: DraftContact[];
  authorised?: DraftContact[];
  courtOrders?: boolean | null;
}

export interface DraftBilling {
  method?: "credit_card" | "bank_account" | "";
  startDate?: string;
  bookingType?: "permanent" | "casual" | "";
  days?: string[];
}

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

export const EMPTY_CHILD: DraftChild = {};

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

const filled = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : Boolean(v);

export function meComplete(me: DraftMe | undefined): boolean {
  if (!me) return false;
  return (
    filled(me.firstName) &&
    filled(me.surname) &&
    filled(me.mobile) &&
    filled(me.dob) &&
    filled(me.street) &&
    filled(me.suburb) &&
    me.isLegalCarer === true &&
    ccsAnswered({ approved: me.ccsApproved ?? null, applied: me.ccsApplied ?? null })
  );
}

export function childComplete(c: DraftChild | undefined): boolean {
  if (!c) return false;
  const medicalAnswered =
    c.medicalNone === true ||
    filled(c.allergies) ||
    filled(c.conditions) ||
    filled(c.medications) ||
    filled(c.dietary);
  return (
    filled(c.firstName) &&
    filled(c.surname) &&
    filled(c.dob) &&
    filled(c.schoolName) &&
    filled(c.yearLevel) &&
    medicalAnswered
  );
}

export function childrenComplete(children: DraftChild[] | undefined): boolean {
  return Array.isArray(children) && children.length > 0 && children.every(childComplete);
}

export function contactComplete(c: DraftContact | undefined): boolean {
  return Boolean(c && filled(c.name) && filled(c.relationship) && filled(c.phone));
}

export function contactsComplete(contacts: DraftContacts | undefined): boolean {
  const emergency = contacts?.emergency ?? [];
  const valid = emergency.filter(contactComplete);
  // Two, and they must be different people — a duplicated row is the same
  // single point of failure the rule exists to avoid.
  const distinct = new Set(
    valid.map((c) => (c.phone ?? "").replace(/\s+/g, "")),
  );
  return valid.length >= 2 && distinct.size >= 2;
}

export function billingComplete(b: DraftBilling | undefined): boolean {
  if (!b) return false;
  if (!filled(b.startDate) || !filled(b.bookingType)) return false;
  // Permanent bookings need the days; casual is by definition ad hoc.
  if (b.bookingType === "permanent") return (b.days ?? []).length > 0;
  return true;
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
      return contactsComplete(d.contacts);
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
