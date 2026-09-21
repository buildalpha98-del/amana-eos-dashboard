import { describe, it, expect } from "vitest";
import {
  validateStep,
  secondaryParentStarted,
  INITIAL_FORM_DATA,
  EMPTY_PARENT,
  type EnrolmentFormData,
  type ParentDetails,
} from "@/components/enrol/types";

/**
 * The second parent's date of birth.
 *
 * It had a field, a red asterisk and a column in the PDF — and nothing that
 * made a family fill it in. `dobRequired` only drew the star, and the wizard
 * has no `<form>` element, so the native `required` attribute never fires.
 * The only gate is `validateStep`, and it asked for the second parent's name
 * and mobile but not their DOB. Packs arrived with it blank and went back to
 * the family before they could be re-keyed into OWNA.
 */

/** A step-1 form that passes everything EXCEPT what a test deliberately breaks. */
function validParentStep(
  secondary: Partial<ParentDetails> = {},
): EnrolmentFormData {
  return {
    ...INITIAL_FORM_DATA,
    courtOrders: false,
    children: [
      {
        ...INITIAL_FORM_DATA.children[0],
        firstName: "Yusuf",
        surname: "Rahman",
        dob: "2018-03-04",
        countryOfBirth: "Australia",
        crn: "123456789A",
      },
    ],
    primaryParent: {
      ...EMPTY_PARENT,
      firstName: "Aisha",
      surname: "Rahman",
      email: "aisha@example.com",
      mobile: "0400111222",
      relationship: "Mother",
      dob: "1988-01-15",
      crn: "987654321B",
      street: "1 Test St",
      suburb: "Beaumont Hills",
      state: "NSW",
      postcode: "2155",
    },
    secondaryParent: { ...EMPTY_PARENT, ...secondary },
  };
}

const FULL_SECONDARY: Partial<ParentDetails> = {
  firstName: "Omar",
  surname: "Rahman",
  mobile: "0400333444",
  dob: "1985-06-02",
};

describe("secondaryParentStarted", () => {
  it("is false for an untouched second parent", () => {
    expect(secondaryParentStarted(EMPTY_PARENT)).toBe(false);
  });

  it("is true from ANY field, not just the first name", () => {
    // The asterisks used to key off firstName alone, so a parent who began
    // with the surname saw no required markers and then hit a wall on Next.
    for (const field of ["firstName", "surname", "email", "mobile"] as const) {
      expect(
        secondaryParentStarted({ ...EMPTY_PARENT, [field]: "something" }),
      ).toBe(true);
    }
    expect(secondaryParentStarted({ ...EMPTY_PARENT, dob: "1985-06-02" })).toBe(
      true,
    );
  });

  it("ignores whitespace", () => {
    expect(secondaryParentStarted({ ...EMPTY_PARENT, firstName: "   " })).toBe(
      false,
    );
  });
});

describe("validateStep(1) — secondary parent date of birth", () => {
  it("blocks the step when the DOB is missing and there are no court orders", () => {
    const errors = validateStep(
      1,
      validParentStep({ ...FULL_SECONDARY, dob: "" }),
    );
    expect(errors).toContain("Secondary parent date of birth is required");
  });

  it("passes once the DOB is supplied", () => {
    expect(validateStep(1, validParentStep(FULL_SECONDARY))).toEqual([]);
  });

  it("still demands the DOB when a court order makes the rest optional but the family began filling it in", () => {
    const data = validParentStep({ firstName: "Omar", surname: "Rahman", mobile: "0400333444" });
    data.courtOrders = true;
    data.courtOrderFiles = [{ filename: "orders.pdf", url: "https://blob/orders.pdf" }];

    expect(validateStep(1, data)).toContain(
      "Secondary parent date of birth is required",
    );
  });

  it("does NOT demand a DOB for a family with court orders and no second parent", () => {
    // A sole carer with orders in place must still be able to finish.
    const data = validParentStep();
    data.courtOrders = true;
    data.courtOrderFiles = [{ filename: "orders.pdf", url: "https://blob/orders.pdf" }];

    expect(validateStep(1, data)).toEqual([]);
  });

  it("asks for the DOB alongside the other second-parent fields, not instead of them", () => {
    const data = validParentStep();
    const errors = validateStep(1, data);

    expect(errors).toEqual(
      expect.arrayContaining([
        "Secondary parent first name is required",
        "Secondary parent surname is required",
        "Secondary parent mobile is required",
        "Secondary parent date of birth is required",
      ]),
    );
  });

  it("leaves the primary parent's DOB rule untouched", () => {
    const data = validParentStep(FULL_SECONDARY);
    data.primaryParent = { ...data.primaryParent, dob: "" };

    expect(validateStep(1, data)).toContain(
      "Primary parent date of birth is required",
    );
  });
});
