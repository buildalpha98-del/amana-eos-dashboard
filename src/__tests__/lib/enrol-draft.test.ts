import { describe, it, expect } from "vitest";
import {
  agreementComplete,
  billingComplete,
  childComplete,
  childrenComplete,
  contactsBlocker,
  contactsComplete,
  draftSubmittable,
  emergencyContactComplete,
  firstIncompleteStep,
  meComplete,
  medicareExpiryValid,
  formatMedicareExpiry,
  stepComplete,
  stepBlocker,
  normaliseSessions,
  SESSION_ROWS,
  EMERGENCY_RELATIONSHIP_OPTIONS,
  type DraftEmergencyContact,
  type EnrolDraft,
} from "@/lib/enrol-draft";

const goodMe = {
  firstName: "Aisha",
  surname: "Rahman",
  mobile: "0400 000 000",
  dob: "1990-01-01",
  street: "1 Test St",
  suburb: "Auburn",
  crn: "123 456 789A",
  culturalBackground: "Lebanese",
  isLegalCarer: true,
  ccsApproved: "yes" as const,
};

const goodChild = {
  firstName: "Yusuf",
  surname: "Rahman",
  dob: "2018-05-02",
  schoolName: "Unity Grammar",
  classroom: "D.G1Y",
  medicareNumber: "2123 45678 1",
  medicareExpiry: "05/2030",
  anaphylaxis: false,
  allergies: false,
  asthma: false,
  otherCondition: false,
  dietaryRestrictions: false,
  paracetamol: true,
  additionalNeeds: false,
  immunisationStatus: "Up to date",
  doctorName: "Dr Smith",
  doctorPhone: "02 9000 0000",
  doctorAddress: "5 Clinic Rd, Auburn NSW 2144",
  uploads: [
    { type: "birth_certificate", filename: "bc.pdf", url: "https://b/bc.pdf" },
    { type: "immunisation_record", filename: "im.pdf", url: "https://b/im.pdf" },
  ],
};

const goodEmergency: DraftEmergencyContact = {
  name: "Fatima Khan",
  relationship: "Auntie",
  phone: "0411 111 111",
  address: "9 Neighbour St, Auburn NSW 2144",
  consentTransport: true,
  consentMedical: true,
  consentOffPremises: true,
  consentAmbulance: true,
  consentOutings: true,
  consentNotify: true,
  consentPickup: true,
};

const goodContacts = {
  courtOrders: false,
  secondaryParent: {
    firstName: "Omar",
    surname: "Rahman",
    mobile: "0422 222 222",
    email: "omar@example.com",
    sameAddressAsPrimary: true,
  },
  emergency: [goodEmergency],
};

const goodBilling = {
  startDate: "2026-08-01",
  bookingType: "permanent" as const,
  sessions: { amanaAfternoons: ["Monday", "Wednesday"] },
};

const goodAgreement = {
  firstAid: true,
  medication: true,
  ambulance: true,
  transport: false,
  excursions: true,
  photos: false,
  sunscreen: true,
  termsAccepted: true,
  privacyAccepted: true,
  signature: "Aisha Rahman",
  referralSource: "School newsletter",
};

const fullDraft: EnrolDraft = {
  me: goodMe,
  children: [goodChild],
  contacts: goodContacts,
  billing: goodBilling,
  agreement: goodAgreement,
};

describe("meComplete", () => {
  it("accepts a filled-in account holder", () => {
    expect(meComplete(goodMe)).toBe(true);
  });

  it("REQUIRES the parent CRN", () => {
    expect(meComplete({ ...goodMe, crn: "" })).toBe(false);
    expect(meComplete({ ...goodMe, crn: "   " })).toBe(false);
  });

  it("requires the legal-carer declaration", () => {
    expect(meComplete({ ...goodMe, isLegalCarer: false })).toBe(false);
  });

  it("still lets a family enrol before CCS is approved, so long as they give a CRN", () => {
    expect(
      meComplete({ ...goodMe, ccsApproved: "no", ccsApplied: "no" }),
    ).toBe(true);
  });

  it("rejects an unanswered CCS question", () => {
    expect(meComplete({ ...goodMe, ccsApproved: undefined })).toBe(false);
  });
});

describe("childComplete", () => {
  it("accepts a fully screened child with both documents", () => {
    expect(childComplete(goodChild)).toBe(true);
  });

  it("requires a classroom, not a year level", () => {
    expect(childComplete({ ...goodChild, classroom: "" })).toBe(false);
  });

  it("rejects any unanswered screening question", () => {
    for (const k of [
      "anaphylaxis",
      "allergies",
      "asthma",
      "otherCondition",
      "dietaryRestrictions",
      "paracetamol",
    ] as const) {
      expect(childComplete({ ...goodChild, [k]: undefined })).toBe(false);
    }
  });

  it("treats an explicit 'no' as answered", () => {
    expect(childComplete({ ...goodChild, paracetamol: false })).toBe(true);
  });

  it("requires the birth certificate and immunisation record", () => {
    expect(childComplete({ ...goodChild, uploads: [] })).toBe(false);
    expect(
      childComplete({ ...goodChild, uploads: [goodChild.uploads[0]] }),
    ).toBe(false);
  });

  it("ignores an upload row with no URL", () => {
    expect(
      childComplete({
        ...goodChild,
        uploads: [
          goodChild.uploads[0],
          { type: "immunisation_record", filename: "x", url: "" },
        ],
      }),
    ).toBe(false);
  });

  it("REQUIRES the Medicare number and expiry", () => {
    expect(childComplete({ ...goodChild, medicareNumber: "" })).toBe(false);
    expect(childComplete({ ...goodChild, medicareExpiry: "" })).toBe(false);
    expect(childComplete({ ...goodChild, medicareExpiry: undefined })).toBe(false);
  });

  it("rejects an expiry that isn't MM/YYYY", () => {
    for (const bad of ["2030", "5/30", "13/2030", "00/2030", "05-2030", "may 2030"]) {
      expect(childComplete({ ...goodChild, medicareExpiry: bad })).toBe(false);
    }
  });

  it("accepts a past expiry — a family renewing shouldn't be locked out", () => {
    expect(childComplete({ ...goodChild, medicareExpiry: "01/2020" })).toBe(true);
  });

  it("rejects when ONE sibling of several is incomplete", () => {
    expect(childrenComplete([goodChild, { firstName: "Sara" }])).toBe(false);
  });

  it("rejects an empty children array", () => {
    expect(childrenComplete([])).toBe(false);
    expect(childrenComplete(undefined)).toBe(false);
  });
});

describe("medicareExpiryValid / formatMedicareExpiry", () => {
  it("accepts MM/YYYY only", () => {
    expect(medicareExpiryValid("05/2030")).toBe(true);
    expect(medicareExpiryValid("12/2026")).toBe(true);
    expect(medicareExpiryValid("5/2030")).toBe(false);
    expect(medicareExpiryValid("13/2030")).toBe(false);
    expect(medicareExpiryValid(undefined)).toBe(false);
  });

  it("inserts the slash as the parent types", () => {
    expect(formatMedicareExpiry("0")).toBe("0");
    expect(formatMedicareExpiry("05")).toBe("05");
    expect(formatMedicareExpiry("052")).toBe("05/2");
    expect(formatMedicareExpiry("052030")).toBe("05/2030");
    // Re-typing over an already-formatted value must not double up.
    expect(formatMedicareExpiry("05/2030")).toBe("05/2030");
    // Overflow is clipped rather than accumulating silently.
    expect(formatMedicareExpiry("0520301234")).toBe("05/2030");
  });
});

describe("emergency contacts", () => {
  it("accepts ONE complete contact — a second is never forced", () => {
    expect(contactsComplete(fullDraft)).toBe(true);
  });

  it("requires every per-contact authorisation to be answered", () => {
    const c = { ...goodEmergency, consentPickup: undefined };
    expect(emergencyContactComplete(c)).toBe(false);
    expect(
      contactsComplete({ ...fullDraft, contacts: { ...goodContacts, emergency: [c] } }),
    ).toBe(false);
  });

  it("does not offer Mum or Dad as a relationship", () => {
    expect(EMERGENCY_RELATIONSHIP_OPTIONS).not.toContain("Mum");
    expect(EMERGENCY_RELATIONSHIP_OPTIONS).not.toContain("Dad");
  });

  it("rejects a contact who is the primary carer, by phone", () => {
    const d: EnrolDraft = {
      ...fullDraft,
      contacts: {
        ...goodContacts,
        emergency: [{ ...goodEmergency, phone: goodMe.mobile }],
      },
    };
    expect(contactsComplete(d)).toBe(false);
    expect(contactsBlocker(d)).toMatch(/other than you/i);
  });

  it("rejects a contact who is the primary carer, by name", () => {
    const d: EnrolDraft = {
      ...fullDraft,
      contacts: {
        ...goodContacts,
        emergency: [{ ...goodEmergency, name: "aisha  rahman" }],
      },
    };
    expect(contactsComplete(d)).toBe(false);
  });

  it("rejects a contact who is the SECOND carer", () => {
    const d: EnrolDraft = {
      ...fullDraft,
      contacts: {
        ...goodContacts,
        emergency: [{ ...goodEmergency, phone: "0422222222" }],
      },
    };
    expect(contactsComplete(d)).toBe(false);
  });
});

describe("second carer requirement", () => {
  it("is mandatory when no court order applies", () => {
    const d: EnrolDraft = {
      ...fullDraft,
      contacts: { ...goodContacts, secondaryParent: {} },
    };
    expect(contactsComplete(d)).toBe(false);
    expect(contactsBlocker(d)).toMatch(/second parent or carer/i);
  });

  it("is excused by a court order, but then the order must be uploaded", () => {
    const noUpload: EnrolDraft = {
      ...fullDraft,
      contacts: { courtOrders: true, secondaryParent: {}, emergency: [goodEmergency] },
    };
    expect(contactsComplete(noUpload)).toBe(false);
    expect(contactsBlocker(noUpload)).toMatch(/upload/i);

    const withUpload: EnrolDraft = {
      ...noUpload,
      contacts: {
        ...noUpload.contacts,
        courtOrderUploads: [
          { type: "court_order", filename: "o.pdf", url: "https://b/o.pdf" },
        ],
        courtOrderRestrictedPersons: "None",
      },
    };
    expect(contactsComplete(withUpload)).toBe(true);
  });

  it("rejects a half-filled second carer even when excused", () => {
    const d: EnrolDraft = {
      ...fullDraft,
      contacts: {
        courtOrders: true,
        courtOrderUploads: [
          { type: "court_order", filename: "o.pdf", url: "https://b/o.pdf" },
        ],
        courtOrderRestrictedPersons: "None",
        secondaryParent: { firstName: "Omar" },
        emergency: [goodEmergency],
      },
    };
    expect(contactsComplete(d)).toBe(false);
  });

  it("requires the court order question to be answered at all", () => {
    const d: EnrolDraft = {
      ...fullDraft,
      contacts: { ...goodContacts, courtOrders: undefined },
    };
    expect(contactsComplete(d)).toBe(false);
    expect(contactsBlocker(d)).toMatch(/court order/i);
  });
});

describe("National Regulations record requirements", () => {
  it("requires the parent's cultural background (reg 160(3)(i))", () => {
    expect(meComplete({ ...goodMe, culturalBackground: "" })).toBe(false);
  });

  it("requires the doctor's name, phone AND address (reg 162(a))", () => {
    expect(childComplete({ ...goodChild, doctorAddress: "" })).toBe(false);
    expect(childComplete({ ...goodChild, doctorPhone: "" })).toBe(false);
    expect(childComplete({ ...goodChild, doctorName: "" })).toBe(false);
  });

  it("requires immunisation status, separate from the uploaded record (reg 162(g))", () => {
    expect(childComplete({ ...goodChild, immunisationStatus: "" })).toBe(false);
  });

  it("requires the additional-needs question to be answered (reg 160(3)(j))", () => {
    expect(childComplete({ ...goodChild, additionalNeeds: undefined })).toBe(false);
    expect(childComplete({ ...goodChild, additionalNeeds: true })).toBe(true);
  });

  it("requires an emergency contact's address (reg 160(3)(d))", () => {
    const d: EnrolDraft = {
      ...fullDraft,
      contacts: {
        ...goodContacts,
        emergency: [{ ...goodEmergency, address: "" }],
      },
    };
    expect(contactsComplete(d)).toBe(false);
  });

  it("requires the second carer's address, or 'same as mine' (reg 160(3)(b))", () => {
    const noAddr: EnrolDraft = {
      ...fullDraft,
      contacts: {
        ...goodContacts,
        secondaryParent: {
          firstName: "Omar",
          surname: "Rahman",
          mobile: "0422 222 222",
        },
      },
    };
    expect(contactsComplete(noAddr)).toBe(false);

    const typed: EnrolDraft = {
      ...noAddr,
      contacts: {
        ...noAddr.contacts,
        secondaryParent: {
          ...noAddr.contacts!.secondaryParent,
          address: "12 Other St, Auburn",
        },
      },
    };
    expect(contactsComplete(typed)).toBe(true);
  });

  it("requires naming who is restricted when a court order applies (reg 160(3)(f))", () => {
    const d: EnrolDraft = {
      ...fullDraft,
      contacts: {
        courtOrders: true,
        courtOrderUploads: [
          { type: "court_order", filename: "o.pdf", url: "https://b/o.pdf" },
        ],
        emergency: [goodEmergency],
      },
    };
    expect(contactsComplete(d)).toBe(false);
    expect(contactsBlocker(d)).toMatch(/restricted/i);
  });
});

describe("session programs", () => {
  it("offers Rise and Shine, Amana Afternoons and Holiday Quest only", () => {
    expect(SESSION_ROWS.map((r) => r.key)).toEqual([
      "riseAndShine",
      "amanaAfternoons",
      "holidayQuest",
    ]);
  });

  it("shows a time against every program", () => {
    for (const r of SESSION_ROWS) expect(r.time).toBeTruthy();
  });

  it("collapses weekdays to a single marker when switching to casual", () => {
    expect(
      normaliseSessions({ riseAndShine: ["Monday", "Friday"] }, "casual"),
    ).toEqual({ riseAndShine: ["yes"] });
  });

  it("keeps a casual pick selected when switching to permanent", () => {
    // The marker isn't a weekday, so the day list empties — but the
    // program stays in the map so the parent sees it's still chosen.
    expect(normaliseSessions({ riseAndShine: ["yes"] }, "permanent")).toEqual({
      riseAndShine: [],
    });
  });

  it("never gives Holiday Quest weekdays — it isn't a per-day program", () => {
    expect(
      normaliseSessions({ holidayQuest: ["Monday"] }, "permanent"),
    ).toEqual({ holidayQuest: ["yes"] });
  });

  it("drops programs with nothing selected", () => {
    expect(normaliseSessions({ riseAndShine: [] }, "casual")).toEqual({});
  });
});

describe("stepBlocker", () => {
  it("is silent when a step is complete", () => {
    for (const s of [0, 1, 2, 3, 4]) {
      expect(stepBlocker(s, fullDraft)).toBeNull();
    }
  });

  it("names the missing CRN rather than saying 'fill in the form'", () => {
    expect(stepBlocker(0, { ...fullDraft, me: { ...goodMe, crn: "" } })).toMatch(
      /CRN/i,
    );
  });

  it("names the CHILD it's complaining about", () => {
    const d: EnrolDraft = {
      ...fullDraft,
      children: [goodChild, { firstName: "Sara" }],
    };
    expect(stepBlocker(1, d)).toMatch(/Sara/);
  });

  it("tells the parent which document is missing", () => {
    const d: EnrolDraft = {
      ...fullDraft,
      children: [{ ...goodChild, uploads: [goodChild.uploads[0]] }],
    };
    expect(stepBlocker(1, d)).toMatch(/immunisation record/i);
  });

  it("points at the Medicare format when the expiry is malformed", () => {
    const d: EnrolDraft = {
      ...fullDraft,
      children: [{ ...goodChild, medicareExpiry: "2030" }],
    };
    expect(stepBlocker(1, d)).toMatch(/MM\/YYYY/);
  });

  it("asks for a session when none is ticked", () => {
    const d: EnrolDraft = {
      ...fullDraft,
      billing: { ...goodBilling, sessions: {} },
    };
    expect(stepBlocker(3, d)).toMatch(/session/i);
  });

  it("falls back to the contacts blocker on step 2", () => {
    const d: EnrolDraft = {
      ...fullDraft,
      contacts: { ...goodContacts, courtOrders: undefined },
    };
    expect(stepBlocker(2, d)).toBe(contactsBlocker(d));
  });
});

describe("billingComplete", () => {
  it("accepts a start date, booking type and at least one session", () => {
    expect(billingComplete(goodBilling)).toBe(true);
  });

  it("requires at least one session, casual bookings included", () => {
    expect(billingComplete({ ...goodBilling, sessions: {} })).toBe(false);
    expect(
      billingComplete({
        startDate: "2026-08-01",
        bookingType: "casual",
        sessions: {},
      }),
    ).toBe(false);
  });

  it("counts a whole-of-session tick, not just weekdays", () => {
    expect(
      billingComplete({
        startDate: "2026-08-01",
        bookingType: "casual",
        sessions: { holidayQuest: ["yes"] },
      }),
    ).toBe(true);
  });

  it("treats an empty day array as nothing selected", () => {
    expect(
      billingComplete({ ...goodBilling, sessions: { amanaAfternoons: [] } }),
    ).toBe(false);
  });

  it("still reads a draft saved before the session grid existed", () => {
    expect(
      billingComplete({
        startDate: "2026-08-01",
        bookingType: "permanent",
        days: ["Monday"],
      }),
    ).toBe(true);
  });

  it("requires the start date and booking type", () => {
    expect(billingComplete({ ...goodBilling, startDate: "" })).toBe(false);
    expect(billingComplete({ ...goodBilling, bookingType: "" })).toBe(false);
  });
});

describe("agreementComplete", () => {
  it("rejects an UNANSWERED consent — not the same as a 'no'", () => {
    const { photos: _photos, ...rest } = goodAgreement;
    expect(agreementComplete(rest)).toBe(false);
  });

  it("requires terms and privacy, but not the debit agreement", () => {
    expect(agreementComplete({ ...goodAgreement, termsAccepted: false })).toBe(false);
    expect(agreementComplete({ ...goodAgreement, privacyAccepted: false })).toBe(false);
    expect(agreementComplete({ ...goodAgreement, debitAgreement: false })).toBe(true);
  });

  it("requires a typed signature", () => {
    expect(agreementComplete({ ...goodAgreement, signature: "  " })).toBe(false);
  });

  // 2026-08-03 (Ambassadors): the referral question became mandatory.
  it("requires 'How did you hear about us?' to be answered", () => {
    expect(agreementComplete({ ...goodAgreement, referralSource: "" })).toBe(false);
    const { referralSource: _ref, ...rest } = goodAgreement;
    expect(agreementComplete(rest)).toBe(false);
  });

  it("the educator option also requires naming the educator", () => {
    expect(
      agreementComplete({
        ...goodAgreement,
        referralSource: "One of our educators",
      }),
    ).toBe(false);
    expect(
      agreementComplete({
        ...goodAgreement,
        referralSource: "One of our educators",
        referralEducatorName: "Aisha",
      }),
    ).toBe(true);
  });
});

describe("stepComplete / draftSubmittable", () => {
  it("passes every step for a full draft", () => {
    for (const s of [0, 1, 2, 3, 4]) {
      expect(stepComplete(s, fullDraft)).toBe(true);
    }
    expect(draftSubmittable(fullDraft)).toBe(true);
    expect(firstIncompleteStep(fullDraft)).toBeNull();
  });

  it("reports the EARLIEST gap when several steps are unfinished", () => {
    const draft: EnrolDraft = { ...fullDraft, children: [], billing: {} };
    expect(firstIncompleteStep(draft)).toBe(1);
  });

  it("treats a completely empty draft as step 0", () => {
    expect(draftSubmittable({})).toBe(false);
    expect(firstIncompleteStep({})).toBe(0);
  });

  it("returns null from contactsBlocker when the step is fine", () => {
    expect(contactsBlocker(fullDraft)).toBeNull();
  });
});
