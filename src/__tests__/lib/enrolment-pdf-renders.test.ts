/**
 * The pack renders even when the record is malformed.
 *
 * Every field this generator reads is a `Json` column and the route
 * hands the row over as `any`, so the interface describes what should
 * be there rather than what is. Three separate reads threw on a wrong
 * shape — spreading a non-array, `.forEach` on an object, and
 * `Object.entries(null)` — and any one of them returned
 * `{"error":"Internal server error"}` for the whole document.
 *
 * These run the real generator rather than a helper, because the point
 * is that nothing in the pipeline throws.
 */
import { describe, it, expect } from "vitest";
import { generateEnrolmentPdf } from "@/lib/enrolment-pdf";

/** Well-formed enough to render, with nothing hostile in it. */
const sane = {
  id: "sub-1",
  primaryParent: { firstName: "Aysha", surname: "Khan", email: "a@b.com" },
  children: [{ firstName: "Mo", surname: "Khan" }],
  emergencyContacts: [{ name: "Nan", relationship: "Grandparent", phone: "04" }],
  consents: { photos: true },
  termsAccepted: true,
  privacyAccepted: true,
  debitAgreement: true,
  courtOrders: false,
  createdAt: new Date("2026-08-01"),
};

/*
 * `as never` rather than `as any`: the whole point is that the real
 * route hands this row over untyped, so the test has to be able to
 * pass shapes the interface forbids.
 */
const render = (over: Record<string, unknown>) =>
  generateEnrolmentPdf({ ...sane, ...over } as never);

describe("generateEnrolmentPdf — hostile JSON", () => {
  it("renders a well-formed submission", async () => {
    await expect(render({})).resolves.toBeTruthy();
  });

  it("survives consents being null", async () => {
    // Object.entries(null) throws. This one was pre-existing, and would
    // have taken the pack down for any submission missing consents.
    await expect(render({ consents: null })).resolves.toBeTruthy();
  });

  it("survives emergency contacts being an object", async () => {
    // `.forEach` is not a function on an object.
    await expect(render({ emergencyContacts: {} })).resolves.toBeTruthy();
  });

  it("survives authorised pickup being a string", async () => {
    await expect(render({ authorisedPickup: "none" })).resolves.toBeTruthy();
  });

  it("survives children being an object", async () => {
    await expect(render({ children: {} })).resolves.toBeTruthy();
  });

  it("survives the upload columns being objects", async () => {
    // The regression that started this: a section that only decorates
    // the document took the whole document down.
    await expect(
      render({ documentUploads: {}, medicalFiles: {}, courtOrderFiles: {} }),
    ).resolves.toBeTruthy();
  });

  it("survives a child's medications being an object", async () => {
    await expect(
      render({
        children: [
          { firstName: "Mo", surname: "Khan", medical: { medications: {} } },
        ],
      }),
    ).resolves.toBeTruthy();
  });

  it("survives booking preferences holding the wrong shapes", async () => {
    await expect(
      render({
        children: [
          {
            firstName: "Mo",
            surname: "Khan",
            bookingPrefs: { sessionTypes: "asc", days: "mon" },
          },
        ],
      }),
    ).resolves.toBeTruthy();
  });

  it("survives every field being wrong at once", async () => {
    // The real failure mode: one bad submission, several bad columns.
    // Guarding them one at a time just moves the crash.
    await expect(
      render({
        children: "x",
        emergencyContacts: 42,
        authorisedPickup: {},
        consents: null,
        documentUploads: "none",
        medicalFiles: {},
      }),
    ).resolves.toBeTruthy();
  });
});
