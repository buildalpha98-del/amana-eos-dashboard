import { describe, it, expect } from "vitest";
import {
  stepComplete,
  stepBlocker,
  type EnrolDraft,
} from "@/lib/enrol-draft";

/**
 * A blocked step must always be able to say why.
 *
 * `/parent/enrol` disabled its Next button whenever `stepComplete` was false
 * and rendered the reason at the BOTTOM of the step. On desktop that reads
 * fine. On a phone the nav bar is sticky, so Next is pinned in the viewport
 * while the explanation sits hundreds of pixels below the fold — measured on
 * a 390x844 screen, Next at y=783 and "Please enter your CRN" at y=1575.
 *
 * Parents tapped a dead button with nothing on screen telling them why, and
 * reported it as "the Next button doesn't work". Next is now always tappable
 * and scrolls to the reason, which makes `stepBlocker` load-bearing: a
 * completeness rule with no matching message would put us straight back to a
 * button that appears to do nothing.
 *
 * These cases walk each step from empty to finished, asserting at every
 * stage that an incomplete step yields a message and a complete one does not.
 */

const COMPLETE_ME = {
  firstName: "Aisha",
  surname: "Rahman",
  mobile: "0400111222",
  dob: "1988-01-15",
  street: "1 Test St",
  suburb: "Beaumont Hills",
  state: "NSW",
  postcode: "2155",
  crn: "123456789A",
  culturalBackground: "Australian",
  isLegalCarer: true,
  ccsApproved: true,
  ccsApplied: true,
};

const COMPLETE_CHILD = {
  firstName: "Yusuf",
  surname: "Rahman",
  dob: "2018-03-04",
  schoolName: "Test Primary",
  classroom: "3B",
  medicareNumber: "1234567890",
  medicareExpiry: "05/2030",
  anaphylaxis: false,
  allergies: false,
  asthma: false,
  otherCondition: false,
  dietaryRestrictions: false,
  paracetamol: true,
  additionalNeeds: false,
  immunisationStatus: "up_to_date",
  doctorName: "Dr Smith",
  doctorPhone: "0299999999",
  doctorAddress: "2 Clinic Rd, Testville",
  uploads: [
    { type: "birth_certificate", url: "https://blob/bc.pdf" },
    { type: "immunisation_record", url: "https://blob/im.pdf" },
  ],
};

const COMPLETE_CONTACTS = {
  courtOrders: false,
  secondaryParent: {
    firstName: "Omar",
    surname: "Rahman",
    mobile: "0400333444",
    sameAddressAsPrimary: true,
  },
  emergency: [
    {
      name: "Fatima Khan",
      relationship: "Aunt",
      phone: "0400555666",
      address: "3 Other St, Testville",
      // All seven EMERGENCY_CONSENTS — an unanswered one is not a "no".
      consentTransport: true,
      consentMedical: true,
      consentOffPremises: true,
      consentAmbulance: true,
      consentOutings: true,
      consentNotify: true,
      consentPickup: true,
    },
  ],
};

const COMPLETE_BILLING = {
  startDate: "2026-10-06",
  bookingType: "permanent",
  // SESSION_ROWS keys, not the internal shorthand.
  sessions: { amanaAfternoons: ["Monday", "Tuesday"] },
};

const COMPLETE_AGREEMENT = {
  firstAid: true,
  medication: true,
  ambulance: true,
  transport: true,
  excursions: true,
  photos: false,
  sunscreen: true,
  termsAccepted: true,
  privacyAccepted: true,
  signature: "Aisha Rahman",
  referralSource: "Facebook",
};

/**
 * Progressively-filled drafts per step: each entry is the state after
 * answering one more thing, so the last is complete and the rest are not.
 */
const LADDERS: Record<number, EnrolDraft[]> = {
  0: [
    {},
    { me: {} },
    { me: { firstName: "Aisha" } },
    { me: { firstName: "Aisha", surname: "Rahman", mobile: "0400111222" } },
    { me: { ...COMPLETE_ME, crn: "" } },
    { me: { ...COMPLETE_ME, culturalBackground: "" } },
    { me: { ...COMPLETE_ME, isLegalCarer: false } },
    { me: { ...COMPLETE_ME, ccsApproved: null, ccsApplied: null } },
    { me: COMPLETE_ME },
  ],
  1: [
    {},
    { children: [] },
    { children: [{}] },
    { children: [{ firstName: "Yusuf", surname: "Rahman" }] },
    { children: [{ ...COMPLETE_CHILD, schoolName: "" }] },
    { children: [{ ...COMPLETE_CHILD, medicareExpiry: "2030" }] },
    { children: [{ ...COMPLETE_CHILD, asthma: undefined }] },
    { children: [{ ...COMPLETE_CHILD, additionalNeeds: undefined }] },
    { children: [{ ...COMPLETE_CHILD, immunisationStatus: "" }] },
    { children: [{ ...COMPLETE_CHILD, doctorAddress: "" }] },
    { children: [{ ...COMPLETE_CHILD, uploads: [] }] },
    // A second child added but not yet filled in.
    { children: [COMPLETE_CHILD, {}] },
    { children: [COMPLETE_CHILD] },
  ],
  2: [
    {},
    { me: COMPLETE_ME, contacts: {} },
    { me: COMPLETE_ME, contacts: { courtOrders: false } },
    {
      me: COMPLETE_ME,
      contacts: { ...COMPLETE_CONTACTS, secondaryParent: { firstName: "Omar" } },
    },
    { me: COMPLETE_ME, contacts: { ...COMPLETE_CONTACTS, emergency: [] } },
    {
      me: COMPLETE_ME,
      contacts: { ...COMPLETE_CONTACTS, emergency: [{ name: "Fatima Khan" }] },
    },
    // An emergency contact who is actually the primary carer.
    {
      me: COMPLETE_ME,
      contacts: {
        ...COMPLETE_CONTACTS,
        emergency: [
          {
            ...COMPLETE_CONTACTS.emergency[0],
            name: "Aisha Rahman",
            phone: "0400111222",
          },
        ],
      },
    },
    // Court orders declared but nothing uploaded, and nobody named.
    { me: COMPLETE_ME, contacts: { ...COMPLETE_CONTACTS, courtOrders: true } },
    {
      me: COMPLETE_ME,
      contacts: {
        ...COMPLETE_CONTACTS,
        courtOrders: true,
        courtOrderUploads: [{ type: "court_order", url: "https://blob/o.pdf" }],
      },
    },
    { me: COMPLETE_ME, contacts: COMPLETE_CONTACTS },
  ],
  3: [
    {},
    { billing: {} },
    { billing: { startDate: "2026-10-06" } },
    { billing: { startDate: "2026-10-06", bookingType: "permanent" } },
    { billing: { ...COMPLETE_BILLING, sessions: {} } },
    { billing: COMPLETE_BILLING },
  ],
  4: [
    {},
    { agreement: {} },
    { agreement: { ...COMPLETE_AGREEMENT, sunscreen: undefined } },
    { agreement: { ...COMPLETE_AGREEMENT, termsAccepted: false } },
    { agreement: { ...COMPLETE_AGREEMENT, signature: "" } },
    { agreement: { ...COMPLETE_AGREEMENT, referralSource: "" } },
    {
      agreement: {
        ...COMPLETE_AGREEMENT,
        referralSource: "One of our educators",
        referralEducatorName: "",
      },
    },
    { agreement: COMPLETE_AGREEMENT },
  ],
} as unknown as Record<number, EnrolDraft[]>;

describe("stepBlocker is never silent", () => {
  for (const [stepStr, drafts] of Object.entries(LADDERS)) {
    const step = Number(stepStr);

    it(`explains every incomplete state of step ${step}`, () => {
      const silent: string[] = [];

      drafts.forEach((draft, i) => {
        const complete = stepComplete(step, draft);
        const blocker = stepBlocker(step, draft);

        if (complete) {
          // A finished step must NOT show a warning.
          expect(blocker, `step ${step} case ${i} is complete`).toBeNull();
        } else if (!blocker || !blocker.trim()) {
          silent.push(`case ${i}: ${JSON.stringify(draft).slice(0, 120)}`);
        }
      });

      expect(
        silent,
        `step ${step} blocks with no explanation — the parent taps Next and nothing happens`,
      ).toEqual([]);
    });

    it(`step ${step}'s ladder ends complete (the fixtures are honest)`, () => {
      // Guards the suite itself: if the final draft stopped being complete,
      // every "incomplete" assertion above would pass for the wrong reason.
      expect(stepComplete(step, drafts[drafts.length - 1])).toBe(true);
    });
  }

  it("names the actual missing field rather than a generic nudge", () => {
    // The whole point of scrolling to this message is that it is actionable.
    expect(stepBlocker(0, { me: { ...COMPLETE_ME, crn: "" } } as EnrolDraft)).toMatch(
      /CRN/i,
    );
    expect(
      stepBlocker(1, { children: [{ ...COMPLETE_CHILD, doctorAddress: "" }] } as EnrolDraft),
    ).toMatch(/doctor/i);
    expect(
      stepBlocker(3, { billing: { ...COMPLETE_BILLING, sessions: {} } } as EnrolDraft),
    ).toMatch(/session/i);
  });

  it("names the child it means when there is more than one", () => {
    const blocker = stepBlocker(1, {
      children: [COMPLETE_CHILD, { firstName: "Maryam" }],
    } as EnrolDraft);
    expect(blocker).toContain("Maryam");
  });
});
