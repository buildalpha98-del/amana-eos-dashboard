import { describe, it, expect } from "vitest";
import {
  agreementComplete,
  billingComplete,
  childComplete,
  childrenComplete,
  contactsComplete,
  draftSubmittable,
  firstIncompleteStep,
  meComplete,
  stepComplete,
  type EnrolDraft,
} from "@/lib/enrol-draft";

const goodMe = {
  firstName: "Aisha",
  surname: "Rahman",
  mobile: "0400 000 000",
  dob: "1990-01-01",
  street: "1 Test St",
  suburb: "Auburn",
  isLegalCarer: true,
  ccsApproved: "yes" as const,
};

const goodChild = {
  firstName: "Yusuf",
  surname: "Rahman",
  dob: "2018-05-02",
  schoolName: "Unity Grammar",
  yearLevel: "Year 1",
  medicalNone: true,
};

const goodContacts = {
  emergency: [
    { name: "Fatima", relationship: "Auntie", phone: "0411 111 111" },
    { name: "Omar", relationship: "Uncle", phone: "0422 222 222" },
  ],
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

  it("requires the legal-carer declaration", () => {
    expect(meComplete({ ...goodMe, isLegalCarer: false })).toBe(false);
  });

  it("does NOT require a CRN — a parent awaiting CCS approval has none", () => {
    expect(meComplete({ ...goodMe, crn: "" })).toBe(true);
  });

  it("accepts 'not approved and not applied' — CCS is non-blocking", () => {
    expect(
      meComplete({ ...goodMe, ccsApproved: "no", ccsApplied: "no" }),
    ).toBe(true);
  });

  it("rejects an unanswered CCS question", () => {
    expect(meComplete({ ...goodMe, ccsApproved: undefined })).toBe(false);
  });

  it("treats whitespace as empty", () => {
    expect(meComplete({ ...goodMe, firstName: "   " })).toBe(false);
  });
});

describe("childComplete", () => {
  it("accepts a child with 'nothing to declare' ticked", () => {
    expect(childComplete(goodChild)).toBe(true);
  });

  it("accepts a child with real medical detail instead of the tick", () => {
    expect(
      childComplete({
        ...goodChild,
        medicalNone: false,
        allergies: "Peanuts — anaphylaxis",
      }),
    ).toBe(true);
  });

  it("rejects a child whose medical section was skipped entirely", () => {
    expect(childComplete({ ...goodChild, medicalNone: false })).toBe(false);
  });

  it("requires a school and year level", () => {
    expect(childComplete({ ...goodChild, schoolName: "" })).toBe(false);
    expect(childComplete({ ...goodChild, yearLevel: "" })).toBe(false);
  });

  it("rejects an empty children array", () => {
    expect(childrenComplete([])).toBe(false);
    expect(childrenComplete(undefined)).toBe(false);
  });

  it("rejects when ONE sibling of several is incomplete", () => {
    expect(childrenComplete([goodChild, { firstName: "Sara" }])).toBe(false);
  });
});

describe("contactsComplete", () => {
  it("accepts two distinct complete contacts", () => {
    expect(contactsComplete(goodContacts)).toBe(true);
  });

  it("rejects a single contact", () => {
    expect(contactsComplete({ emergency: [goodContacts.emergency[0]] })).toBe(
      false,
    );
  });

  it("rejects two rows that are the same person — the point is redundancy", () => {
    expect(
      contactsComplete({
        emergency: [
          { name: "Fatima", relationship: "Auntie", phone: "0411 111 111" },
          { name: "Fatima R", relationship: "Auntie", phone: "0411111111" },
        ],
      }),
    ).toBe(false);
  });

  it("ignores half-filled rows rather than counting them", () => {
    expect(
      contactsComplete({
        emergency: [...goodContacts.emergency, { name: "Half" }],
      }),
    ).toBe(true);
  });

  it("does not require a second parent", () => {
    expect(contactsComplete({ ...goodContacts, secondaryParent: {} })).toBe(true);
  });
});

describe("billingComplete", () => {
  it("requires days for a permanent booking", () => {
    expect(billingComplete({ ...goodBilling, days: [] })).toBe(false);
  });

  it("does NOT require days for a casual booking", () => {
    expect(
      billingComplete({
        startDate: "2026-08-01",
        bookingType: "casual",
        days: [],
      }),
    ).toBe(true);
  });

  it("requires a start date", () => {
    expect(billingComplete({ ...goodBilling, startDate: "" })).toBe(false);
  });
});

describe("agreementComplete", () => {
  it("accepts a mix of yes and no consents", () => {
    expect(agreementComplete(goodAgreement)).toBe(true);
  });

  it("rejects an UNANSWERED consent — not the same as a 'no'", () => {
    const { photos: _photos, ...rest } = goodAgreement;
    expect(agreementComplete(rest)).toBe(false);
  });

  it("requires terms and privacy, but not the debit agreement", () => {
    expect(agreementComplete({ ...goodAgreement, termsAccepted: false })).toBe(
      false,
    );
    expect(agreementComplete({ ...goodAgreement, privacyAccepted: false })).toBe(
      false,
    );
    expect(agreementComplete({ ...goodAgreement, debitAgreement: false })).toBe(
      true,
    );
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

  it("blocks submission and names the first gap", () => {
    const draft: EnrolDraft = { ...fullDraft, contacts: {} };
    expect(draftSubmittable(draft)).toBe(false);
    expect(firstIncompleteStep(draft)).toBe(2);
  });

  it("reports the EARLIEST gap when several steps are unfinished", () => {
    const draft: EnrolDraft = { ...fullDraft, children: [], billing: {} };
    expect(firstIncompleteStep(draft)).toBe(1);
  });

  it("treats a completely empty draft as step 0", () => {
    expect(draftSubmittable({})).toBe(false);
    expect(firstIncompleteStep({})).toBe(0);
  });

  it("returns false for an out-of-range step rather than throwing", () => {
    expect(stepComplete(9, fullDraft)).toBe(false);
  });
});
