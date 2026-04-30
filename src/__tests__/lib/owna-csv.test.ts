import { describe, it, expect } from "vitest";
import { buildOwnaCsv, ownaCsvFilename, OWNA_CSV_COLUMNS, type OwnaCsvInput } from "@/lib/owna-csv";

function fixture(overrides: Partial<OwnaCsvInput> = {}): OwnaCsvInput {
  return {
    childFirstName: "Ada",
    childLastName: "Lovelace",
    childDateOfBirth: new Date("2017-05-12T00:00:00Z"),
    childGender: "female",
    childSchool: "Amana Primary",
    childYear: "Year 2",
    sessionTypes: ["BSC", "ASC"],
    startDate: new Date("2026-05-01T00:00:00Z"),
    medicalConditions: ["Asthma"],
    dietaryRequirements: ["Nut-free"],
    medicationDetails: "Ventolin as needed",
    additionalNeeds: null,
    parent: {
      firstName: "Grace",
      lastName: "Lovelace",
      email: "grace@example.com",
      phone: "+61400000000",
      address: "1 Analytical Lane",
      suburb: "Coalbrook",
      state: "NSW",
      postcode: "2000",
    },
    ...overrides,
  };
}

describe("OWNA_CSV_COLUMNS", () => {
  it("exposes the column list for external adjustment", () => {
    expect(OWNA_CSV_COLUMNS).toEqual([
      "first_name",
      "last_name",
      "dob",
      "gender",
      "address",
      "suburb",
      "state",
      "postcode",
      "parent_first_name",
      "parent_last_name",
      "parent_email",
      "parent_phone",
      "medical_notes",
      "dietary_notes",
      "school",
      "year_level",
      "session_types",
      "start_date",
    ]);
  });
});

describe("buildOwnaCsv", () => {
  it("produces a header row + one data row", () => {
    const csv = buildOwnaCsv(fixture());
    const lines = csv.split("\n");
    expect(lines.length).toBe(2);
  });

  it("formats the child row with dob in YYYY-MM-DD", () => {
    const csv = buildOwnaCsv(fixture());
    expect(csv).toContain("Ada");
    expect(csv).toContain("Lovelace");
    expect(csv).toContain("2017-05-12");
    expect(csv).toContain("female");
  });

  it("joins session types with a pipe", () => {
    const csv = buildOwnaCsv(fixture({ sessionTypes: ["BSC", "ASC", "VAC"] }));
    expect(csv).toContain("BSC|ASC|VAC");
  });

  it("joins medical and dietary arrays with a semicolon", () => {
    const csv = buildOwnaCsv(
      fixture({
        medicalConditions: ["Asthma", "Eczema"],
        dietaryRequirements: ["Nut-free", "Dairy-free"],
      }),
    );
    expect(csv).toContain("Asthma; Eczema");
    expect(csv).toContain("Nut-free; Dairy-free");
  });

  it("appends medication details and additional needs to medical_notes", () => {
    const csv = buildOwnaCsv(
      fixture({
        medicationDetails: "Ventolin",
        additionalNeeds: "Needs quiet space",
      }),
    );
    expect(csv).toContain("Medication: Ventolin");
    expect(csv).toContain("Additional needs: Needs quiet space");
  });

  it("escapes double-quotes and commas safely", () => {
    const csv = buildOwnaCsv(
      fixture({
        childSchool: 'St "Mary", The Great',
        medicationDetails: 'Inject "EpiPen" if needed',
        medicalConditions: [],
      }),
    );
    expect(csv).toContain('"St ""Mary"", The Great"');
    expect(csv).toContain('"Medication: Inject ""EpiPen"" if needed"');
  });

  it("leaves empty strings for missing optional fields", () => {
    const csv = buildOwnaCsv(
      fixture({
        childGender: null,
        childSchool: null,
        childYear: null,
        startDate: null,
        medicationDetails: null,
        additionalNeeds: null,
        medicalConditions: [],
        dietaryRequirements: [],
      }),
    );
    const [header, row] = csv.split("\n");
    const headerCols = header.split(",");
    const rowCols = row.split(",");
    expect(rowCols.length).toBe(headerCols.length);
  });

  it("emits a UTF-8 BOM so Excel opens it correctly", () => {
    const csv = buildOwnaCsv(fixture());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});

describe("ownaCsvFilename", () => {
  it("includes the child name and today's date", () => {
    const name = ownaCsvFilename(
      { childFirstName: "Ada", childLastName: "Lovelace" },
      new Date("2026-04-22T09:00:00Z"),
    );
    expect(name).toBe("enrolment-ada-lovelace-2026-04-22.csv");
  });

  it("sanitises unsafe filename characters", () => {
    const name = ownaCsvFilename(
      { childFirstName: "A/B", childLastName: "C\\D" },
      new Date("2026-04-22T09:00:00Z"),
    );
    expect(name).not.toContain("/");
    expect(name).not.toContain("\\");
  });
});
