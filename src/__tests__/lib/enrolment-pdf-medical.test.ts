/**
 * The portal form (/parent/enrol) and the legacy wizard store the same
 * medical facts under different keys. The pack read only the legacy names,
 * so every portal enrolment printed with no anaphylaxis status,
 * immunisation status, medications, dietary needs or paracetamol consent.
 */
import { describe, it, expect } from "vitest";
import { childMedicalRows } from "@/lib/enrolment-pdf";

const asMap = (rows: Array<[string, string]>) => Object.fromEntries(rows);

describe("childMedicalRows", () => {
  it("prints a portal submission's medical answers (the shape submit writes)", () => {
    const rows = asMap(
      childMedicalRows({
        anaphylaxis: true,
        allergies: true,
        asthma: false,
        otherCondition: true,
        dietaryRestrictions: true,
        paracetamolConsent: false,
        allergiesDetail: "Peanuts",
        asthmaDetail: "",
        otherConditionDetail: "Epilepsy",
        dietaryDetail: "Halal only",
        medications: "EpiPen 0.3mg as needed",
        doctorName: "Dr Ali",
        doctorPhone: "02 9000 0000",
        doctorAddress: "1 Main St, Greenacre",
        immunisationStatus: "Yes",
        additionalNeeds: true,
        additionalNeedsDetail: "Hearing aid",
        medicareNumber: "1234567890",
        medicareExpiry: "04/2029",
      }),
    );

    expect(rows["Anaphylaxis"]).toBe("Yes");
    expect(rows["Allergy Details"]).toBe("Peanuts");
    expect(rows["Asthma"]).toBe("No");
    expect(rows["Immunisation"]).toBe("Yes");
    expect(rows["Medications"]).toBe("EpiPen 0.3mg as needed");
    expect(rows["Dietary Restrictions"]).toBe("Yes");
    expect(rows["Dietary Details"]).toBe("Halal only");
    expect(rows["Paracetamol (if parents unreachable)"]).toBe("No");
    expect(rows["Other Condition Details"]).toBe("Epilepsy");
    expect(rows["Additional Needs Details"]).toBe("Hearing aid");
    expect(rows["Doctor"]).toBe("Dr Ali");
    expect(rows["Doctor Address"]).toBe("1 Main St, Greenacre");
  });

  it("never prints 'undefined' when the practice name is missing", () => {
    const rows = asMap(childMedicalRows({ doctorName: "Dr Ali" }));
    expect(rows["Doctor"]).toBe("Dr Ali");
    expect(JSON.stringify(rows)).not.toContain("undefined");
  });

  it("still reads a legacy-wizard submission", () => {
    const rows = asMap(
      childMedicalRows({
        anaphylaxisRisk: true,
        immunisationUpToDate: false,
        immunisationDetails: "Catch-up booked",
        allergyDetails: "Eggs",
        allergies: true,
        otherConditions: "Diabetes",
        medications: [{ name: "Insulin", dosage: "2u", frequency: "lunch" }],
        dietaryRequirements: true,
        dietaryDetails: "No pork",
        doctorName: "Dr B",
        doctorPractice: "Coburg Clinic",
      }),
    );
    expect(rows["Anaphylaxis"]).toBe("Yes");
    expect(rows["Immunisation"]).toBe("No");
    expect(rows["Immunisation Details"]).toBe("Catch-up booked");
    expect(rows["Allergy Details"]).toBe("Eggs");
    expect(rows["Other Conditions"]).toBe("Diabetes");
    expect(rows["Medications"]).toBe("Insulin (2u, lunch)");
    expect(rows["Dietary Details"]).toBe("No pork");
    expect(rows["Doctor"]).toBe("Dr B — Coburg Clinic");
  });

  it("keeps an explicit 'No' rather than dropping it as empty", () => {
    const rows = asMap(childMedicalRows({ anaphylaxis: false }));
    expect(rows["Anaphylaxis"]).toBe("No");
  });
});
