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
  /** Reg 160(3)(i) requires the cultural background of the child AND parents. */
  culturalBackground?: string;
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
  /** Reg 162(a) requires the practitioner's ADDRESS, not just a phone. */
  doctorAddress?: string;
  /** Reg 162(g) — immunisation STATUS, distinct from the uploaded record. */
  immunisationStatus?: string;
  /** Reg 160(3)(j) — additional needs / special considerations. */
  additionalNeeds?: boolean | null;
  additionalNeedsDetail?: string;

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
  /**
   * Reg 160(3)(d)-(e) require the ADDRESS of an emergency contact and of
   * anyone authorised to collect the child — not just a phone number.
   */
  address?: string;
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
  /** Reg 160(3)(b) — address of EACH parent/guardian. */
  address?: string;
  /** Saves retyping when both carers live together. */
  sameAddressAsPrimary?: boolean;
}

export interface DraftContacts {
  secondaryParent?: DraftSecondaryParent;
  /** ONE is required. More are welcome; a second is never forced. */
  emergency?: DraftEmergencyContact[];
  courtOrders?: boolean | null;
  courtOrderUploads?: DraftUpload[];
  /**
   * Reg 160(3)(f): the record must name any person whose access to the
   * child is PROHIBITED or restricted. "A court order exists" is not
   * enough for an educator deciding whether to release a child at the
   * door — they need the name.
   */
  courtOrderRestrictedPersons?: string;
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

/**
 * Reg 162(g). "Exemption" is a real, lawful category (medical
 * contraindication or a recognised exemption) and omitting it would force
 * those families to answer inaccurately.
 */
export const IMMUNISATION_STATUS_OPTIONS = [
  "Up to date",
  "Not up to date / catching up",
  "Medical exemption",
  "Other exemption",
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
    filled(me.culturalBackground) &&
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

  // Reg 162(a): the practitioner's name, ADDRESS and phone must all be on
  // the record. Reg 162(g): immunisation status.
  const doctor =
    filled(c.doctorName) && filled(c.doctorPhone) && filled(c.doctorAddress);

  return (
    filled(c.firstName) &&
    filled(c.surname) &&
    filled(c.dob) &&
    filled(c.schoolName) &&
    filled(c.classroom) &&
    screeningAnswered &&
    typeof c.additionalNeeds === "boolean" &&
    filled(c.immunisationStatus) &&
    doctor &&
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
    filled(c.name) &&
    filled(c.relationship) &&
    filled(c.phone) &&
    filled(c.address) &&
    consentsAnswered
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
  // Address may be inherited from the primary carer rather than typed.
  const hasAddress = Boolean(sp?.sameAddressAsPrimary || filled(sp?.address));
  return Boolean(
    sp && filled(sp.firstName) && filled(sp.surname) && filled(sp.mobile) && hasAddress,
  );
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
    // An educator at the door needs the NAME, not just "an order exists".
    if (!filled(contacts.courtOrderRestrictedPersons)) return false;
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
    return "Please add a second parent or carer — first name, last name, mobile and address. If a court order means you can't, answer Yes to the court order question above.";
  }
  if (contacts.courtOrders === true) {
    if (secondaryParentFilled(sp) && !secondaryParentValid(sp)) {
      return "Please complete the second carer's first name, last name and mobile, or clear those fields.";
    }
    if ((contacts.courtOrderUploads ?? []).length === 0) {
      return "Please upload a copy of the court order or parenting plan.";
    }
    if (!filled(contacts.courtOrderRestrictedPersons)) {
      return "Please name anyone whose contact with your child is restricted, so our educators know.";
    }
  }

  const all = contacts.emergency ?? [];
  const valid = all.filter(emergencyContactComplete);
  if (valid.length < 1) {
    return all.length === 0
      ? "Please add one emergency contact."
      : "Please complete the emergency contact's name, relationship, phone and address, and answer each of the authorisation questions.";
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

/**
 * Why this step won't let the parent continue, or null when it will.
 *
 * Exists because a disabled button explains nothing on a touch device —
 * `title` tooltips need a hover that phones don't have. The Child step
 * alone has a dozen required fields spread over a long scroll, so
 * "something above is missing" is not a usable hint.
 */
export function stepBlocker(step: number, d: EnrolDraft): string | null {
  if (stepComplete(step, d)) return null;
  switch (step) {
    case 0: {
      const me = d.me ?? {};
      if (!filled(me.crn)) {
        return "Please enter your CRN — we need it to claim your Child Care Subsidy.";
      }
      if (!filled(me.culturalBackground)) {
        return "Please select your cultural background.";
      }
      if (!me.isLegalCarer) {
        return "Please confirm you're the parent or legal carer.";
      }
      if (
        !ccsAnswered({
          approved: me.ccsApproved ?? null,
          applied: me.ccsApplied ?? null,
        })
      ) {
        return "Please answer the Child Care Subsidy questions.";
      }
      return "Please fill in your name, mobile, date of birth and home address.";
    }
    case 1: {
      const kids = d.children ?? [];
      if (kids.length === 0) return "Please add your child's details.";
      const i = kids.findIndex((c) => !childComplete(c));
      if (i === -1) return null;
      const c = kids[i];
      const who = c.firstName?.trim() || `Child ${i + 1}`;
      if (!filled(c.firstName) || !filled(c.surname) || !filled(c.dob)) {
        return `Please complete ${who}'s name and date of birth.`;
      }
      if (!filled(c.schoolName) || !filled(c.classroom)) {
        return `Please select ${who}'s school and enter their classroom.`;
      }
      if (!filled(c.medicareNumber) || !medicareExpiryValid(c.medicareExpiry)) {
        return `Please enter ${who}'s Medicare number and expiry as MM/YYYY.`;
      }
      const screening = [
        c.anaphylaxis,
        c.allergies,
        c.asthma,
        c.otherCondition,
        c.dietaryRestrictions,
        c.paracetamol,
        c.additionalNeeds,
      ];
      if (screening.some((v) => typeof v !== "boolean")) {
        return `Please answer every health question for ${who} with Yes or No.`;
      }
      if (!filled(c.immunisationStatus)) {
        return `Please select ${who}'s immunisation status.`;
      }
      if (
        !filled(c.doctorName) ||
        !filled(c.doctorPhone) ||
        !filled(c.doctorAddress)
      ) {
        return `Please add ${who}'s doctor — name, phone and address.`;
      }
      const missing = REQUIRED_CHILD_DOCUMENTS.filter(
        (doc) => !hasUpload(c, doc.type),
      );
      if (missing.length) {
        return `Please upload ${who}'s ${missing
          .map((m) => m.label.toLowerCase())
          .join(" and ")}. A photo from your phone is fine.`;
      }
      return `Please finish ${who}'s details.`;
    }
    case 2:
      return contactsBlocker(d);
    case 3: {
      const b = d.billing ?? {};
      if (!filled(b.startDate)) return "Please choose a preferred start date.";
      if (!filled(b.bookingType)) return "Please choose a booking type.";
      if (!anySessionSelected(b)) {
        return "Please tick at least one session — before school care, after school care, or Holiday Quest.";
      }
      return "Please complete the booking details.";
    }
    case 4:
      return agreementComplete(d.agreement)
        ? null
        : "Please answer every consent, accept the terms and privacy policy, and type your name to sign.";
    default:
      return null;
  }
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
