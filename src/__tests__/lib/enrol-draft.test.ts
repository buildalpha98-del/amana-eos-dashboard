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
  stepComplete,
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
  isLegalCarer: true,
  ccsApproved: "yes" as const,
};

const goodChild = {
  firstName: "Yusuf",
  surname: "Rahman",
  dob: "2018-05-02",
  schoolName: "Unity Grammar",
  classroom: "D.G1Y",
  anaphylaxis: false,
  allergies: false,
  asthma: false,
  otherCondition: false,
  dietaryRestrictions: false,
  paracetamol: true,
  uploads: [
    { type: "birth_certificate", filename: "bc.pdf", url: "https://b/bc.pdf" },
    { type: "immunisation_record", filename: "im.pdf", url: "https://b/im.pdf" },
  ],
};

const goodEmergency: DraftEmergencyContact = {
  name: "Fatima Khan",
  relationship: "Auntie",
  phone: "0411 111 111",
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
  },
  emergency: [goodEmergency],
};

const goodBilling = {
  startDate: "2026-08-01",
  bookingType: "permanent" as const,
  days: ["Monday", "Wednesday"],
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

  it("pairs the Medicare number with its expiry", () => {
    expect(childComplete({ ...goodChild, medicareNumber: "12345" })).toBe(false);
    expect(childComplete({ ...goodChild, medicareExpiry: "05/2030" })).toBe(false);
    expect(
      childComplete({
        ...goodChild,
        medicareNumber: "12345",
        medicareExpiry: "05/2030",
      }),
    ).toBe(true);
  });

  it("rejects when ONE sibling of several is incomplete", () => {
    expect(childrenComplete([goodChild, { firstName: "Sara" }])).toBe(false);
  });

  it("rejects an empty children array", () => {
    expect(childrenComplete([])).toBe(false);
    expect(childrenComplete(undefined)).toBe(false);
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

describe("billingComplete", () => {
  it("requires days for a permanent booking", () => {
    expect(billingComplete({ ...goodBilling, days: [] })).toBe(false);
  });

  it("does NOT require days for a casual booking", () => {
    expect(
      billingComplete({ startDate: "2026-08-01", bookingType: "casual", days: [] }),
    ).toBe(true);
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
