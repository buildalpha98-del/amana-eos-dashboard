/**
 * Parent / guardian details in the enrolment pack.
 *
 * THE BUG (2026-09-17): every optional field on `primaryParentSchema` was
 * `z.string().optional()`, which accepts `undefined` but REJECTS `null`. A
 * rejected field failed the whole object, `parseJsonField` returned its
 * `{firstName:"",surname:""}` fallback, and the pack printed an empty
 * "Primary Parent / Guardian" section. One null `crn` — a field nobody had
 * filled in — was enough. The dashboard reads the raw JSON, so staff saw the
 * family's details on screen and then downloaded a pack with none of them.
 *
 * These assert on the RENDERED bytes rather than on the parse, because
 * "the schema accepts it" is precisely the thing that was true while the PDF
 * came out blank.
 */
import { describe, it, expect } from "vitest";
import { generateEnrolmentPdf } from "@/lib/enrolment-pdf";

const base = {
  id: "sub-1",
  children: [{ firstName: "Mo", surname: "Khan" }],
  emergencyContacts: [{ name: "Nan", relationship: "Grandparent", phone: "04" }],
  consents: { photos: true },
  termsAccepted: true,
  privacyAccepted: true,
  debitAgreement: true,
  courtOrders: false,
  createdAt: new Date("2026-08-01"),
};

const primary = {
  firstName: "Aysha",
  surname: "Khan",
  dob: "1988-04-02",
  email: "aysha@example.com",
  mobile: "0400111222",
  street: "12 Smith St",
  suburb: "Greenacre",
  state: "NSW",
  postcode: "2190",
  relationship: "Mother",
  occupation: "Nurse",
  workplace: "Bankstown Hospital",
  workPhone: "0298000000",
  crn: "123456789A",
  soleCustody: false,
};

const secondary = {
  firstName: "Omar",
  surname: "Khan",
  dob: "1985-07-11",
  email: "omar@example.com",
  mobile: "0400333444",
  street: "",
  suburb: "",
  state: "",
  postcode: "",
  relationship: "Father",
  occupation: "Driver",
  workplace: "Transdev",
  workPhone: "",
  crn: "987654321B",
  livesWithPrimary: false,
};

/** The generated pack as searchable text. */
async function renderText(over: Record<string, unknown>): Promise<string> {
  const doc = await generateEnrolmentPdf({ ...base, ...over } as never);
  return Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1");
}

describe("primary parent survives an imperfect record", () => {
  it("prints every field when the record is clean", async () => {
    const txt = await renderText({ primaryParent: primary });
    for (const value of [
      "Aysha",
      "1988-04-02",
      "aysha@example.com",
      "0400111222",
      "12 Smith St",
      "Nurse",
      "Bankstown Hospital",
      "123456789A",
    ]) {
      expect(txt).toContain(value);
    }
  });

  // The regression itself, one field at a time. Each of these blanked the
  // WHOLE section before the fix.
  for (const field of ["crn", "dob", "email", "occupation", "workPhone", "workplace"]) {
    it(`still prints the rest when ${field} is null`, async () => {
      const txt = await renderText({
        primaryParent: { ...primary, [field]: null },
      });
      expect(txt).toContain("Aysha");
      expect(txt).toContain("12 Smith St");
      expect(txt).toContain("0400111222");
    });
  }

  it("still prints the rest when the surname is missing entirely", async () => {
    const txt = await renderText({
      primaryParent: { ...primary, surname: undefined },
    });
    expect(txt).toContain("Aysha");
    expect(txt).toContain("aysha@example.com");
  });

  it("survives a shape the schema cannot parse at all", async () => {
    // An address stored as an object rather than a line. Falls back to the raw
    // record and coerces per field, so the name and email still print.
    const txt = await renderText({
      primaryParent: { ...primary, address: { street: "12 Smith St" } },
    });
    expect(txt).toContain("Aysha");
    expect(txt).toContain("aysha@example.com");
  });

  it("falls back to a legacy single-line address", async () => {
    const txt = await renderText({
      primaryParent: {
        firstName: "Aysha",
        surname: "Khan",
        address: "12 Smith St, Greenacre NSW 2190",
      },
    });
    expect(txt).toContain("12 Smith St, Greenacre NSW 2190");
  });
});

describe("secondary parent is a full record, not a name and a mobile", () => {
  it("prints the employment and CRN details the other system needs", async () => {
    // The pack exists to be re-keyed into OWNA. A second parent recorded as a
    // name and a phone number means ringing the family back for the rest.
    const txt = await renderText({
      primaryParent: primary,
      secondaryParent: secondary,
    });
    expect(txt).toContain("Omar");
    expect(txt).toContain("1985-07-11");
    expect(txt).toContain("Driver");
    expect(txt).toContain("Transdev");
    expect(txt).toContain("987654321B");
  });

  it("resolves their address from the primary when they live together", async () => {
    const txt = await renderText({
      primaryParent: primary,
      secondaryParent: { ...secondary, livesWithPrimary: true },
    });
    // Rendered at PDF time, not copied at submit time — so it follows the
    // primary's address if that is ever corrected.
    expect(txt).toContain("12 Smith St");
    expect(txt).toContain("same as primary");
  });

  it("keeps their own address when they do not live together", async () => {
    const txt = await renderText({
      primaryParent: primary,
      secondaryParent: {
        ...secondary,
        livesWithPrimary: false,
        street: "8 Other Rd",
        suburb: "Bankstown",
        state: "NSW",
        postcode: "2200",
      },
    });
    expect(txt).toContain("8 Other Rd");
    expect(txt).not.toContain("same as primary");
  });

  it("says so plainly when the tick is on but the primary has no address yet", async () => {
    const txt = await renderText({
      primaryParent: { firstName: "Aysha", surname: "Khan" },
      secondaryParent: { ...secondary, livesWithPrimary: true },
    });
    expect(txt).toContain("Same as primary");
  });

  it("is omitted entirely when there is no second parent", async () => {
    const txt = await renderText({ primaryParent: primary });
    expect(txt).not.toContain("Secondary Parent");
  });
});
