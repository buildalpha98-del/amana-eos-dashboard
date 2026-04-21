/**
 * OWNA-importable CSV export for enrolment applications.
 *
 * One row per application. Column set is locked in OWNA_CSV_COLUMNS so
 * downstream edits (e.g. if OWNA's import schema differs) are a single-point
 * change. The helper is pure and framework-free so the route can wrap it in
 * any response type.
 */

/** Column order — edit here if OWNA's import schema differs. */
export const OWNA_CSV_COLUMNS = [
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
] as const;

export interface OwnaCsvInput {
  childFirstName: string;
  childLastName: string;
  childDateOfBirth: Date;
  childGender: string | null;
  childSchool: string | null;
  childYear: string | null;
  sessionTypes: string[];
  startDate: Date | null;
  medicalConditions: string[];
  dietaryRequirements: string[];
  medicationDetails: string | null;
  additionalNeeds: string | null;
  parent: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    suburb: string;
    state: string;
    postcode: string;
  };
}

function isoDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildMedicalNotes(input: OwnaCsvInput): string {
  const parts: string[] = [];
  if (input.medicalConditions.length > 0) {
    parts.push(input.medicalConditions.join("; "));
  }
  if (input.medicationDetails) {
    parts.push(`Medication: ${input.medicationDetails}`);
  }
  if (input.additionalNeeds) {
    parts.push(`Additional needs: ${input.additionalNeeds}`);
  }
  return parts.join(" | ");
}

/** Build a single-row OWNA-import CSV from an enrolment application. */
export function buildOwnaCsv(input: OwnaCsvInput): string {
  const values: Record<(typeof OWNA_CSV_COLUMNS)[number], string> = {
    first_name: input.childFirstName,
    last_name: input.childLastName,
    dob: isoDate(input.childDateOfBirth),
    gender: input.childGender ?? "",
    address: input.parent.address ?? "",
    suburb: input.parent.suburb ?? "",
    state: input.parent.state ?? "",
    postcode: input.parent.postcode ?? "",
    parent_first_name: input.parent.firstName,
    parent_last_name: input.parent.lastName,
    parent_email: input.parent.email,
    parent_phone: input.parent.phone,
    medical_notes: buildMedicalNotes(input),
    dietary_notes: input.dietaryRequirements.join("; "),
    school: input.childSchool ?? "",
    year_level: input.childYear ?? "",
    session_types: input.sessionTypes.join("|"),
    start_date: isoDate(input.startDate),
  };

  const header = OWNA_CSV_COLUMNS.map((c) => escapeCsv(c)).join(",");
  const row = OWNA_CSV_COLUMNS.map((c) => escapeCsv(values[c])).join(",");
  // BOM so Excel opens as UTF-8
  return `\uFEFF${header}\n${row}`;
}

/** `enrolment-{first}-{last}-{YYYY-MM-DD}.csv`, sanitised. */
export function ownaCsvFilename(
  app: Pick<OwnaCsvInput, "childFirstName" | "childLastName">,
  now: Date = new Date(),
): string {
  const safe = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `enrolment-${safe(app.childFirstName)}-${safe(app.childLastName)}-${isoDate(now)}.csv`;
}
