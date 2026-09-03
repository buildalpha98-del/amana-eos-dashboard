/**
 * POST /api/parent/enrolment-draft/submit — the real submission path.
 *
 * This is the endpoint a family's five-step enrolment actually goes
 * through, and it had no tests. `enrol.test.ts` covers `/api/enrol`,
 * which is the SIBLING path for an already-signed-in parent; the two
 * routes share a wizard and almost no code.
 *
 * The parts worth pinning down are the ones that fail QUIETLY. Nothing
 * here throws at the parent: an unmatched school, a failed encryption, a
 * bounced confirmation email and a session that won't re-sign all
 * degrade on purpose, so the only way to know they still behave is to
 * assert it. The 583 lines below them are the one moment a family's
 * Medicare numbers, medical conditions and bank details are written.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";
import { ApiError } from "@/lib/api-error";
import type {
  DraftBilling,
  DraftChild,
  DraftEmergencyContact,
  DraftMe,
  DraftSecondaryParent,
  DraftAgreement,
  DraftUpload,
} from "@/lib/enrol-draft";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false })),
}));

const warn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: (...a: unknown[]) => warn(...a),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

const parentRef: { accountId?: string; enrolmentIds: string[] } = {
  accountId: "acc-1",
  enrolmentIds: ["old-sub"],
};
const signParentJwt = vi.fn(() => Promise.resolve("signed.jwt"));
const setParentSessionCookie = vi.fn();

/**
 * The wrapper's error handling is reproduced, not stubbed away: three of
 * this route's guards ARE `ApiError`s, and a mock that let them escape
 * would test that they throw rather than what the parent is told.
 */
vi.mock("@/lib/parent-auth", () => ({
  signParentJwt: (...a: unknown[]) => signParentJwt(...(a as [])),
  setParentSessionCookie: (...a: unknown[]) => setParentSessionCookie(...a),
  withParentAuth:
    (handler: (req: Request, ctx: unknown) => Promise<Response>) =>
    async (req: Request, routeContext?: unknown) => {
      try {
        return await handler(req, {
          ...((routeContext as object) ?? {}),
          parent: {
            email: "aysha@example.com",
            name: "Aysha Khan",
            enrolmentIds: parentRef.enrolmentIds,
            accountId: parentRef.accountId,
          },
        });
      } catch (err) {
        if (err instanceof ApiError) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        throw err;
      }
    },
}));

const encryptField = vi.fn((s: string) => `enc:${s.length}`);
vi.mock("@/lib/field-encryption", () => ({
  encryptField: (s: string) => encryptField(s),
}));

const sendEmail = vi.fn<(a: unknown) => Promise<{ sent: string[] }>>(() =>
  Promise.resolve({ sent: ["ok"] }),
);
vi.mock("@/lib/email", () => ({ sendEmail: (a: unknown) => sendEmail(a) }));

const enrolmentReceivedEmail = vi.fn(() =>
  Promise.resolve({ subject: "We've got it", html: "<p>ta</p>" }),
);
const secondaryCarerInviteEmail = vi.fn(() =>
  Promise.resolve({ subject: "Join", html: "<p>join</p>" }),
);
vi.mock("@/lib/email-templates/parent-account", () => ({
  enrolmentReceivedEmail: () => enrolmentReceivedEmail(),
  secondaryCarerInviteEmail: () => secondaryCarerInviteEmail(),
}));

const logAmbassadorEnrolments = vi.fn<(a: unknown) => Promise<void>>(() =>
  Promise.resolve(),
);
vi.mock("@/lib/ambassadors/log-enrolment", () => ({
  logAmbassadorEnrolments: (a: unknown) => logAmbassadorEnrolments(a),
}));

const cancelPreEnrolmentNurture = vi.fn(() => Promise.resolve());
vi.mock("@/lib/nurture-scheduler", () => ({
  cancelPreEnrolmentNurture: (...a: unknown[]) =>
    cancelPreEnrolmentNurture(...(a as [])),
}));

import { POST } from "@/app/api/parent/enrolment-draft/submit/route";

// ---------------------------------------------------------------------------
// A draft that genuinely passes draftSubmittable()
// ---------------------------------------------------------------------------

/**
 * Built to satisfy the REAL completeness rules rather than a stub of
 * them — the point of the server-side re-check is that it's the same
 * `src/lib/enrol-draft.ts` the wizard uses, so mocking it out would
 * leave the gate untested.
 */
type Draft = {
  me: DraftMe;
  children: DraftChild[];
  contacts: {
    courtOrders: boolean;
    secondaryParent?: DraftSecondaryParent;
    emergency: DraftEmergencyContact[];
    courtOrderUploads?: DraftUpload[];
    courtOrderRestrictedPersons?: string;
  };
  billing: DraftBilling;
  agreement: DraftAgreement;
};

function validChild(overrides: Partial<DraftChild> = {}): DraftChild {
  return {
    firstName: "Mo",
    surname: "Khan",
    dob: "2018-03-04",
    gender: "Male",
    schoolName: "Minaret College Springvale",
    classroom: "D.G1Y",
    anaphylaxis: false,
    allergies: true,
    asthma: false,
    otherCondition: false,
    dietaryRestrictions: false,
    paracetamol: true,
    additionalNeeds: false,
    allergiesDetail: "Peanuts",
    immunisationStatus: "Yes",
    doctorName: "Dr Rose",
    doctorPhone: "03 9000 0000",
    doctorAddress: "1 Clinic Rd, Coburg",
    medicareNumber: "1234 56789 1",
    medicareExpiry: "05/2030",
    uploads: [
      { type: "birth_certificate", filename: "bc.pdf", url: "https://blob/bc.pdf" },
      { type: "immunisation_record", filename: "im.pdf", url: "https://blob/im.pdf" },
      { type: "medical_action_plan", filename: "plan.pdf", url: "https://blob/plan.pdf" },
    ],
    ...overrides,
  };
}

function validDraft(): Draft {
  return {
    me: {
      firstName: "Aysha",
      surname: "Khan",
      mobile: "0400 111 222",
      dob: "1990-04-02",
      street: "12 Wattle St",
      suburb: "Coburg",
      state: "VIC",
      postcode: "3058",
      crn: "123456789A",
      culturalBackground: "Lebanese",
      isLegalCarer: true,
      ccsApproved: "yes",
    },
    children: [validChild()],
    contacts: {
      courtOrders: false,
      secondaryParent: {
        firstName: "Sam",
        surname: "Khan",
        mobile: "0400 333 444",
        email: "sam@example.com",
        relationship: "Parent",
        sameAddressAsPrimary: true,
      },
      emergency: [
        {
          name: "Layla Aziz",
          relationship: "Auntie",
          phone: "0400 555 666",
          address: "9 Rose St, Coburg",
          consentTransport: true,
          consentMedical: true,
          consentOffPremises: true,
          consentAmbulance: true,
          consentOutings: true,
          consentNotify: true,
          consentPickup: true,
        },
      ],
    },
    billing: {
      startDate: "2026-09-01",
      bookingType: "permanent",
      sessions: { amanaAfternoons: ["Monday", "Tuesday"] },
    },
    agreement: {
      firstAid: true,
      medication: true,
      ambulance: true,
      transport: true,
      excursions: true,
      photos: true,
      sunscreen: true,
      termsAccepted: true,
      privacyAccepted: true,
      signature: "Aysha Khan",
      referralSource: "Google",
    },
  };
}

const CARD = {
  method: "credit_card" as const,
  cardName: "A Khan",
  cardNumber: "4111 1111 1111 4242",
  cardExpiryMonth: "05",
  cardExpiryYear: "2031",
  cardCcv: "123",
};

const BANK = {
  method: "bank_account" as const,
  bankAccountName: "A Khan",
  bankBsb: "063-123",
  bankAccountNumber: "12345678",
};

const submit = (body: Record<string, unknown> = {}) =>
  POST(
    createRequest("POST", "/api/parent/enrolment-draft/submit", { body }),
    undefined as never,
  );

/** The EnrolmentSubmission.create argument from the last run. */
const submissionData = () =>
  prismaMock.enrolmentSubmission.create.mock.calls[0][0].data as Record<
    string,
    unknown
  >;

/** Every Child.create argument, in the order the children were listed. */
const childData = (): Record<string, unknown>[] =>
  prismaMock.child.create.mock.calls.map(
    (c: [{ data: Record<string, unknown> }]) => c[0].data,
  );

function setDraft(data: unknown, submittedAt: Date | null = null) {
  prismaMock.enrolmentDraft.findUnique.mockResolvedValue({
    id: "draft-1",
    data,
    submittedAt,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  parentRef.accountId = "acc-1";
  parentRef.enrolmentIds = ["old-sub"];
  encryptField.mockImplementation((s: string) => `enc:${s.length}`);

  setDraft(validDraft());
  prismaMock.service.findMany.mockResolvedValue([
    { id: "svc-springvale", name: "Amana OSHC Minaret Springvale" },
    { id: "svc-coburg", name: "Amana OSHC AIA Coburg" },
  ]);
  prismaMock.enrolmentSubmission.create.mockResolvedValue({ id: "sub-1" });
  prismaMock.child.create.mockResolvedValue({ id: "child-1" });
  prismaMock.child.findMany.mockResolvedValue([{ id: "child-1" }]);
  prismaMock.authorisedPickup.createMany.mockResolvedValue({ count: 0 });
  prismaMock.enrolmentDraft.update.mockResolvedValue({ id: "draft-1" });
  prismaMock.parentAccount.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.parentAccount.findUnique.mockResolvedValue({
    ambassadorRefCode: null,
  });
});

// ---------------------------------------------------------------------------

describe("submit — who may submit", () => {
  it("refuses a session with no account", async () => {
    // A pre-accounts magic-link session can still reach this route, and
    // the whole handler keys off accountId — without the guard it would
    // look up `where: { accountId: undefined }` and take the first draft
    // it found.
    parentRef.accountId = undefined;
    const res = await submit({ payment: CARD });

    expect(res.status).toBe(403);
    expect(prismaMock.enrolmentSubmission.create).not.toHaveBeenCalled();
  });

  it("reads the draft belonging to that account, not to the email", async () => {
    await submit({ payment: CARD });
    expect(prismaMock.enrolmentDraft.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: "acc-1" } }),
    );
  });

  it("says so when there's nothing to submit", async () => {
    prismaMock.enrolmentDraft.findUnique.mockResolvedValue(null);
    const res = await submit({ payment: CARD });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no enrolment to submit/i);
  });

  it("won't enrol the same family twice", async () => {
    // `submittedAt` is the only thing standing between a double-tap and
    // two sets of Child rows on the same centre's roll.
    setDraft(validDraft(), new Date("2026-08-01"));
    const res = await submit({ payment: CARD });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already been submitted/i);
    expect(prismaMock.enrolmentSubmission.create).not.toHaveBeenCalled();
  });
});

describe("submit — the server-side completeness re-check", () => {
  it("rejects a draft the client would have blocked", async () => {
    // The disabled button is a courtesy; this endpoint is reachable
    // directly with curl.
    setDraft({});
    const res = await submit({ payment: CARD });
    expect(res.status).toBe(400);
    expect(prismaMock.enrolmentSubmission.create).not.toHaveBeenCalled();
  });

  it("names the step that's actually missing", async () => {
    // "Form incomplete" is useless to someone who has just been allowed
    // to press Submit. A child with no immunisation record fails step 1.
    const draft = validDraft();
    draft.children = [validChild({ uploads: [] })];
    setDraft(draft);

    const res = await submit({ payment: CARD });
    expect((await res.json()).error).toContain('"Your child"');
  });

  it("names a later step when the early ones are fine", async () => {
    const draft = validDraft();
    draft.agreement.signature = "";
    setDraft(draft);

    const res = await submit({ payment: CARD });
    expect((await res.json()).error).toContain('"Agreement"');
  });

  it("catches an emergency contact who is the parent themselves", async () => {
    // Completeness here is a policy check, not just a null check — the
    // contact we ring when we can't reach you can't be you.
    const draft = validDraft();
    draft.contacts.emergency[0].name = "Aysha Khan";
    draft.contacts.emergency[0].phone = "0400 111 222";
    setDraft(draft);

    const res = await submit({ payment: CARD });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('"Contacts"');
  });
});

describe("submit — payment", () => {
  it("stores only the last four digits of a card", async () => {
    await submit({ payment: CARD });
    const details = submissionData().paymentDetails as Record<string, unknown>;

    expect(details.lastFour).toBe("4242");
    expect(details.cardType).toBe("Visa");
    expect(JSON.stringify(details)).not.toContain("4111");
  });

  it("keeps the expiry readable so cards can be chased before they lapse", async () => {
    // Deliberately outside the encrypted blob: the reminder job must be
    // able to find expiring cards without decrypting anyone's number.
    await submit({ payment: CARD });
    const details = submissionData().paymentDetails as Record<string, unknown>;
    expect(details.expiryMonth).toBe("05");
    expect(details.expiryYear).toBe("2031");
  });

  it("masks a bank account to the BSB's last three and account's last four", async () => {
    await submit({ payment: BANK });
    const details = submissionData().paymentDetails as Record<string, unknown>;

    expect(details.bsbLastThree).toBe("123");
    expect(details.accountLastFour).toBe("5678");
    expect(JSON.stringify(details)).not.toContain("12345678");
  });

  it("encrypts under the canonical field names, not the request's", async () => {
    // Storing the request shape here is what produced two incompatible
    // encrypted formats and a reveal that rendered blank.
    await submit({ payment: BANK });
    const stored = JSON.parse(encryptField.mock.calls[0][0]);

    expect(stored).toMatchObject({
      method: "bank_account",
      accountName: "A Khan",
      bsb: "063-123",
      accountNumber: "12345678",
    });
    expect(stored).not.toHaveProperty("bankAccountNumber");
  });

  it("still enrols the family when encryption fails", async () => {
    // The masked copy is what staff read; the encrypted one is a bonus
    // for the OWNA port. Losing it must not cost them the enrolment.
    encryptField.mockImplementation(() => {
      throw new Error("no key configured");
    });

    const res = await submit({ payment: CARD });
    expect(res.status).toBe(200);

    const details = submissionData().paymentDetails as Record<string, unknown>;
    expect(details.lastFour).toBe("4242");
    expect(details).not.toHaveProperty("raw");
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/encryption failed/i),
      expect.anything(),
    );
  });

  it("accepts a submission with no payment block at all", async () => {
    // The schema marks it optional, and a family paying another way
    // shouldn't hit a 400 on the last screen.
    const res = await submit({});
    expect(res.status).toBe(200);
    expect(submissionData().paymentMethod).toBeNull();
    expect(encryptField).not.toHaveBeenCalled();
  });
});

describe("submit — attaching children to a centre", () => {
  it("resolves the school to a service", async () => {
    // Before this existed, submitted children were created with
    // serviceId null: in the database, absent from their centre's
    // children list, roll, ratios and billing.
    await submit({ payment: CARD });

    expect(childData()[0].serviceId).toBe("svc-springvale");
    expect(submissionData().serviceId).toBe("svc-springvale");
  });

  it("leaves it null rather than guessing at an unknown school", async () => {
    // A wrong match puts a child on the wrong roll and the wrong
    // invoice. Null is visible and fixable at approval.
    const draft = validDraft();
    draft.children = [validChild({ schoolName: "Bayside Primary School" })];
    setDraft(draft);

    await submit({ payment: CARD });
    expect(childData()[0].serviceId).toBeNull();
    expect(submissionData().serviceId).toBeNull();
  });

  it("resolves siblings separately when they're at different campuses", async () => {
    const draft = validDraft();
    draft.children = [
      validChild(),
      validChild({ firstName: "Sara", schoolName: "AIA Coburg" }),
    ];
    setDraft(draft);

    await submit({ payment: CARD });
    expect(childData().map((c) => c.serviceId)).toEqual([
      "svc-springvale",
      "svc-coburg",
    ]);
  });

  it("leaves the submission unassigned when siblings disagree", async () => {
    // One submission, two centres — there is no right answer, so staff
    // pick rather than the first child deciding for everyone.
    const draft = validDraft();
    draft.children = [
      validChild(),
      validChild({ firstName: "Sara", schoolName: "AIA Coburg" }),
    ];
    setDraft(draft);

    await submit({ payment: CARD });
    expect(submissionData().serviceId).toBeNull();
  });

  it("creates children pending, not active", async () => {
    // canBook() reads this — an active child could book before anyone
    // had reviewed the enrolment.
    await submit({ payment: CARD });
    expect(childData()[0].status).toBe("pending");
  });
});

describe("submit — the authorised pickup list", () => {
  it("adds the second carer automatically", async () => {
    // Nothing used to create these on a fresh enrolment, so a new family
    // had an EMPTY pickup list despite naming a second carer — educators
    // at the door had nothing to check against.
    await submit({ payment: CARD });

    const rows = prismaMock.authorisedPickup.createMany.mock.calls[0][0].data;
    expect(rows).toContainEqual(
      expect.objectContaining({
        name: "Sam Khan",
        phone: "0400 333 444",
        isEmergencyContact: false,
        childId: "child-1",
      }),
    );
  });

  it("adds an emergency contact who has pickup permission", async () => {
    await submit({ payment: CARD });
    const rows = prismaMock.authorisedPickup.createMany.mock.calls[0][0].data;
    expect(rows).toContainEqual(
      expect.objectContaining({ name: "Layla Aziz", isEmergencyContact: true }),
    );
  });

  it("leaves out a contact who wasn't given that permission", async () => {
    const draft = validDraft();
    draft.contacts.emergency[0].consentPickup = false;
    setDraft(draft);

    await submit({ payment: CARD });
    const rows = prismaMock.authorisedPickup.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { name: string }) => r.name)).not.toContain("Layla Aziz");
  });

  it("still builds a list when a court order means there's no second carer", async () => {
    // The one family shape where the second carer is legitimately absent.
    // The emergency contact is then the only name at the door, so an
    // empty list here would be worse than anywhere else.
    const draft = validDraft();
    delete draft.contacts.secondaryParent;
    draft.contacts.courtOrders = true;
    draft.contacts.courtOrderUploads = [
      { type: "court_order", filename: "o.pdf", url: "https://blob/o.pdf" },
    ];
    draft.contacts.courtOrderRestrictedPersons = "Redacted Name";
    setDraft(draft);

    await submit({ payment: CARD });
    const rows = prismaMock.authorisedPickup.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { name: string }) => r.name)).toEqual(["Layla Aziz"]);
  });

  it("copies the list onto every child in the family", async () => {
    // The rows are per CHILD — a sibling with an empty pickup list is the
    // same problem in half a household.
    const draft = validDraft();
    draft.children = [validChild(), validChild({ firstName: "Sara" })];
    setDraft(draft);
    prismaMock.child.findMany.mockResolvedValue([
      { id: "child-1" },
      { id: "child-2" },
    ]);

    await submit({ payment: CARD });
    const rows = prismaMock.authorisedPickup.createMany.mock.calls[0][0]
      .data as { childId: string }[];
    expect(new Set(rows.map((r) => r.childId))).toEqual(
      new Set(["child-1", "child-2"]),
    );
    expect(rows).toHaveLength(4);
  });
});

describe("submit — what lands on the submission", () => {
  it("takes the email from the session, not the draft", async () => {
    // The draft is parent-supplied; the session is the one thing here
    // that has been proven.
    await submit({ payment: CARD });
    const primary = submissionData().primaryParent as Record<string, unknown>;
    expect(primary.email).toBe("aysha@example.com");
  });

  it("splits medical action plans out from the other documents", async () => {
    await submit({ payment: CARD });
    const data = submissionData();
    expect(
      (data.medicalFiles as { filename: string }[]).map((f) => f.filename),
    ).toEqual(["plan.pdf"]);
    expect(
      (data.documentUploads as { filename: string }[]).map((f) => f.filename),
    ).toEqual(["bc.pdf", "im.pdf"]);
  });

  it("copies the carer's cultural background onto the child", async () => {
    // Reg 160(3)(i) wants the child AND parents; we stopped asking twice.
    await submit({ payment: CARD });
    expect(childData()[0].culturalBackground).toEqual(["Lebanese"]);
  });

  it("puts a restricted person in front of the educator who needs it", async () => {
    // custodyArrangements is what the medical and sign-out screens read.
    // Left in the submission blob it would never be seen at the door.
    const draft = validDraft();
    draft.contacts.courtOrders = true;
    draft.contacts.courtOrderUploads = [
      { type: "court_order", filename: "o.pdf", url: "https://blob/o.pdf" },
    ];
    draft.contacts.courtOrderRestrictedPersons = "Redacted Name";
    setDraft(draft);

    await submit({ payment: CARD });
    expect(childData()[0].custodyArrangements).toMatchObject({
      type: "court_order",
      details: "Redacted Name",
      courtOrderUrl: "https://blob/o.pdf",
    });
  });

  it("stamps the draft submitted so it can't be sent again", async () => {
    await submit({ payment: CARD });
    const arg = prismaMock.enrolmentDraft.update.mock.calls[0][0] as {
      where: { id: string };
      data: { submittedAt: Date };
    };
    expect(arg.where).toEqual({ id: "draft-1" });
    expect(arg.data.submittedAt).toBeInstanceOf(Date);
  });

  it("names the household without overwriting a staff correction", async () => {
    await submit({ payment: CARD });
    const arg = prismaMock.parentAccount.updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: { familyName: string };
    };
    expect(arg.data.familyName).toBe("Khan");
    expect(arg.where.OR).toEqual([{ familyName: null }, { familyName: "" }]);
  });
});

/**
 * Regression: the booking grid never reached the roll.
 *
 * `bookingPrefs` is read by generateBookings() (enrolment approval,
 * assign-service, and the booking-generator and booking-extend crons),
 * by the enrolment PDF and by the service's children tab. All four want
 * `sessionTypes` plus `days` KEYED BY SESSION TYPE with lowercase
 * weekday names.
 *
 * This route wrote a flat capitalised list, built from
 * `sessions.beforeSchool` and `sessions.afterSchool` — keys no writer
 * has ever produced, since the grid's are riseAndShine /
 * amanaAfternoons / holidayQuest. So the list was empty every time, and
 * would have been the wrong shape even full.
 *
 * A family picking Rise and Shine on Monday and Tuesday therefore got a
 * blank booking section on their enrolment pack, "Not set" on the
 * centre's children list, and ZERO bookings generated when staff
 * approved them — the child never appeared on the roll.
 */
describe("submit — booking preferences the dashboard can actually read", () => {
  const prefs = () =>
    childData()[0].bookingPrefs as {
      sessionTypes: string[];
      days: Record<string, string[]>;
      sessions: Record<string, string[]>;
      bookingType: string;
      startDate: string;
    };

  it("names the session types the family picked", async () => {
    await submit({ payment: CARD });
    expect(prefs().sessionTypes).toEqual(["asc"]);
  });

  it("keys the days by session type, not as a flat list", async () => {
    await submit({ payment: CARD });
    expect(prefs().days).toEqual({ asc: ["monday", "tuesday"] });
  });

  it("lowercases the weekdays, because that's what the lookup uses", async () => {
    // DAY_NAME_TO_INDEX in booking-generator.ts is keyed "monday". A
    // capitalised name misses it and generates nothing, silently.
    await submit({ payment: CARD });
    expect(prefs().days.asc).not.toContain("Monday");
  });

  it("maps every row on the grid to its session type", async () => {
    const draft = validDraft();
    draft.billing.sessions = {
      riseAndShine: ["Monday"],
      amanaAfternoons: ["Monday", "Friday"],
      holidayQuest: ["yes"],
    };
    setDraft(draft);

    await submit({ payment: CARD });
    expect(prefs().sessionTypes.sort()).toEqual(["asc", "bsc", "vc"]);
    expect(prefs().days.bsc).toEqual(["monday"]);
    expect(prefs().days.asc).toEqual(["monday", "friday"]);
  });

  it("keeps a whole-of-session tick out of the weekday list", async () => {
    // Casual bookings and Holiday Quest store ["yes"] rather than days.
    // Left in, generateBookings would look up a weekday called "yes".
    const draft = validDraft();
    draft.billing.sessions = { holidayQuest: ["yes"] };
    setDraft(draft);

    await submit({ payment: CARD });
    expect(prefs().sessionTypes).toEqual(["vc"]);
    expect(prefs().days.vc).toEqual([]);
  });

  it("carries the booking type and start date generateBookings needs", async () => {
    await submit({ payment: CARD });
    expect(prefs().bookingType).toBe("permanent");
    expect(prefs().startDate).toBe("2026-09-01");
  });

  it("keeps the parent's raw grid answer alongside the translation", async () => {
    await submit({ payment: CARD });
    expect(prefs().sessions).toEqual({ amanaAfternoons: ["Monday", "Tuesday"] });
  });

  it("flags a pre-grid draft rather than guessing its session", async () => {
    // Old drafts stored a flat day list with no session attached. Picking
    // one for them would put a child on the wrong session's roll.
    const draft = validDraft();
    draft.billing.sessions = {};
    draft.billing.days = ["Monday"];
    setDraft(draft);

    await submit({ payment: CARD });
    expect(prefs().sessionTypes).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/pre-grid booking days/i),
      expect.anything(),
    );
  });
});

describe("submit — the things that must not cost a family their enrolment", () => {
  it("survives a failed confirmation email", async () => {
    // Someone who just finished a five-step form must not be told it
    // failed because our mail provider hiccuped.
    enrolmentReceivedEmail.mockRejectedValueOnce(new Error("smtp down"));
    const res = await submit({ payment: CARD });

    expect(res.status).toBe(200);
    expect((await res.json()).submissionId).toBe("sub-1");
  });

  it("survives a failed second-carer invite", async () => {
    secondaryCarerInviteEmail.mockRejectedValueOnce(new Error("bounced"));
    const res = await submit({ payment: CARD });
    expect(res.status).toBe(200);
  });

  it("survives the nurture cancellation failing", async () => {
    cancelPreEnrolmentNurture.mockRejectedValueOnce(new Error("nope"));
    const res = await submit({ payment: CARD });
    expect(res.status).toBe(200);
  });

  it("survives the session refresh failing", async () => {
    signParentJwt.mockRejectedValueOnce(new Error("no secret"));
    const res = await submit({ payment: CARD });
    expect(res.status).toBe(200);
  });
});

describe("submit — after it commits", () => {
  it("invites the second carer to the portal", async () => {
    await submit({ payment: CARD });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sam@example.com" }),
    );
  });

  it("doesn't invite the second carer when that's the submitter's own address", async () => {
    // Same person on both halves of the form — an invite to yourself to
    // join an account you're already in.
    const draft = validDraft();
    draft.contacts.secondaryParent!.email = "AYSHA@Example.com ";
    setDraft(draft);

    await submit({ payment: CARD });
    expect(secondaryCarerInviteEmail).not.toHaveBeenCalled();
  });

  it("confirms receipt to the family", async () => {
    await submit({ payment: CARD });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "aysha@example.com" }),
    );
  });

  it("stops the pre-enrolment chase for the centre they joined", async () => {
    // "Need a hand with the form?" the morning after they finished it is
    // the kind of thing families remember.
    await submit({ payment: CARD });
    expect(cancelPreEnrolmentNurture).toHaveBeenCalledWith(
      "aysha@example.com",
      "svc-springvale",
    );
  });

  it("doesn't chase a null service", async () => {
    const draft = validDraft();
    draft.children = [validChild({ schoolName: "Bayside Primary School" })];
    setDraft(draft);

    await submit({ payment: CARD });
    expect(cancelPreEnrolmentNurture).not.toHaveBeenCalled();
  });

  it("re-issues the session with the new enrolment attached", async () => {
    // enrolmentIds is baked into the JWT at login and only ever filtered
    // DOWN afterwards — without this the family would be sent straight
    // back into the form they just completed.
    await submit({ payment: CARD });
    expect(signParentJwt).toHaveBeenCalledWith(
      expect.objectContaining({
        enrolmentIds: ["old-sub", "sub-1"],
        accountId: "acc-1",
      }),
    );
    expect(setParentSessionCookie).toHaveBeenCalled();
  });

  it("logs the ambassador referral with the account's own code", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue({
      ambassadorRefCode: "REF123",
    });
    await submit({ payment: CARD });
    expect(logAmbassadorEnrolments).toHaveBeenCalledWith({
      submissionId: "sub-1",
      refCode: "REF123",
    });
  });
});
