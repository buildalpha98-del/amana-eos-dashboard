# Portal & Enrolment Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship OWNA-importable CSV export for sibling enrolment applications, verify the Parent Portal end-to-end with Playwright, and close the WeeklyDataEntry fetch→mutateApi gap from sub-project 3a reviewer feedback.

**Architecture:**
- Server-side helper `buildOwnaCsv()` formats a single `EnrolmentApplication` row into OWNA-import CSV. API route returns `text/csv` with `Content-Disposition: attachment`. Tracking via one new nullable field `EnrolmentApplication.ownaExportedAt`.
- Parent portal E2E tests exercise the magic-link → verify → children → attendance → messages → account flow directly against the dev server (like existing specs), seeding a `ParentMagicLink` row for deterministic token verification.
- `WeeklyDataEntry` component migrates two raw `fetch()` calls to `fetchApi`/`mutateApi`, consistent with the pattern used across every other hook in the codebase.

**Tech Stack:** Next.js 16 (app router), TypeScript, Prisma 5.22, PostgreSQL, Vitest, Playwright, React Query.

---

## Open questions resolved

- **OWNA CSV column spec**: Jayden didn't supply a reference template. Plan uses this default column set (Jayden can tweak later via a single-point edit in `src/lib/owna-csv.ts`):
  - `first_name`, `last_name`, `dob`, `gender`, `address`, `suburb`, `state`, `postcode`, `parent_first_name`, `parent_last_name`, `parent_email`, `parent_phone`, `medical_notes`, `dietary_notes`, `school`, `year_level`, `session_types`, `start_date`
  - Columns flagged in the PR body for Jayden to reshape post-merge.

## Pre-flight: confirmed data shapes

Verified before writing any code:

1. **`CentreContact` (Prisma model)** — has only `id, email, firstName, lastName, serviceId, subscribed, status, withdrawalDate, withdrawalReason, createdAt, updatedAt, onboardingProgress`. **No** `address`, `suburb`, `state`, `postcode`, or `mobile` fields.
2. **`EnrolmentSubmission.primaryParent` (JSON column)** — wizard writes `{ firstName, surname, dob, email, mobile, address, suburb, state, postcode, relationship, occupation, ... }` (separate address fields — verified in `src/components/enrol/steps/ParentDetailsStep.tsx`).
3. **Role hierarchy** (`src/lib/role-permissions.ts`) — `rolePriority` has `coordinator: 2, member: 2, staff: 1`. A `hasMinRole("coordinator")` check passes for `member` because both sit at tier 2. The 403 test case must therefore use `staff` (tier 1).

These findings drive two plan decisions:
- The OWNA CSV route loads parent address by looking up the **most recent non-draft `EnrolmentSubmission`** whose `primaryParent.email` matches `application.family.email` (scoped to the same `serviceId`). If no matching submission exists, address fields are left empty — the CSV still exports with parent name, email, and child details.
- All route tests mock `@/lib/api-error` and `@/lib/api-handler` (per `enrolments.test.ts:32-62`) and stub `prismaMock.user.findUnique.mockResolvedValue({ active: true })` in `beforeEach`.

## Baseline reminders (from CLAUDE.md and parent roadmap)

- Build: `npm run build`
- Types: `npx tsc --noEmit`
- Unit tests: `npm test`
- E2E tests: `npm run test:e2e`
- 1298 tests currently pass, 0 tsc errors. We expect ~30 new tests (unit + E2E).
- Every new `useQuery` needs `retry: 2` and `staleTime`. Every new `useMutation` needs an `onError` toast. Write routes need Zod. Auth routes use `withApiAuth`; public/cowork/webhook routes use `withApiHandler` + `authenticateCowork()` where applicable.
- Every mutation error path uses `toast({ variant: "destructive", description: err.message })`.
- Prefer `mutateApi`/`fetchApi` over raw `fetch()` in client hooks (except FormData uploads or SSE).
- Use `.toLowerCase().trim()` when comparing emails.

---

## File structure

**New files:**
- `src/lib/owna-csv.ts` — Pure functions: `buildOwnaCsv(app: EnrolmentApplicationLike)` returns CSV string; `ownaCsvFilename(app)` returns `enrolment-{firstname}-{lastname}-{YYYY-MM-DD}.csv`. Includes `OWNA_CSV_COLUMNS` exported constant for external adjustment.
- `src/app/api/enrolment-applications/[id]/owna-csv/route.ts` — `GET` endpoint: auth via `withApiAuth` (minRole coordinator); loads the application; builds CSV; sets `ownaExportedAt = now()` atomically; returns `text/csv` with `Content-Disposition: attachment`.
- `src/__tests__/lib/owna-csv.test.ts` — Unit tests for `buildOwnaCsv`, `ownaCsvFilename`.
- `src/__tests__/api/enrolment-applications-owna-csv.test.ts` — Route tests: auth (401), not-found (404), role-below-coordinator (403), happy path (200 + Content-Disposition header + ownaExportedAt write).
- `prisma/migrations/20260422120000_add_enrolment_owna_exported_at/migration.sql` — `ALTER TABLE "EnrolmentApplication" ADD COLUMN "ownaExportedAt" TIMESTAMP(3);`
- `tests/e2e/parent-portal.spec.ts` — Playwright coverage: magic-link request → verify → children list → attendance → message send/reply → account update → logout.
- `tests/e2e/helpers/seed-parent-portal.ts` — Small helper to seed an `EnrolmentSubmission` + `ParentMagicLink` + `Child` via Prisma in `test.beforeAll`, and a `cleanup` to tear it down.

**Modified files:**
- `prisma/schema.prisma` — Add `ownaExportedAt DateTime?` to `EnrolmentApplication`.
- `src/hooks/useEnrolmentApplications.ts` — Extend `EnrolmentApplicationDetail` with `ownaExportedAt: string | null`; add `useDownloadOwnaCsv()` mutation that triggers the browser download and invalidates the detail query.
- `src/app/api/enrolment-applications/[id]/route.ts` — Include `ownaExportedAt` in the serialized response.
- `src/components/enrolments/SiblingApplicationReviewPanel.tsx` — Add "Download OWNA CSV" button in the action bar; show "Exported on {date}" under the header when `ownaExportedAt != null`; no re-download restriction (button is always available; label changes to "Re-download OWNA CSV").
- `src/components/services/WeeklyDataEntry.tsx` — Replace two raw fetches with `fetchApi`/`mutateApi`.

---

## Chunk 1: OWNA CSV export (schema + helper + API + tests)

### Task 1.1: Add `ownaExportedAt` to `EnrolmentApplication`

**Files:**
- Modify: `prisma/schema.prisma` (add one field after `createdChildId`)
- Create: `prisma/migrations/20260422120000_add_enrolment_owna_exported_at/migration.sql`

- [ ] **Step 1.1.1: Edit `prisma/schema.prisma`**

In the `EnrolmentApplication` model, add a new field immediately after `createdChildId`:

```prisma
  // If approved, the created child record
  createdChildId String?

  // OWNA CSV export tracking (set when admin downloads the OWNA-import CSV)
  ownaExportedAt DateTime?

  createdAt DateTime @default(now())
```

- [ ] **Step 1.1.2: Create migration file**

Create `prisma/migrations/20260422120000_add_enrolment_owna_exported_at/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "EnrolmentApplication" ADD COLUMN "ownaExportedAt" TIMESTAMP(3);
```

- [ ] **Step 1.1.3: Regenerate Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" output, no errors. Do NOT run `prisma migrate dev` against the live DB — Jayden applies the SQL in Neon manually after PR merge. The migration file has to exist so Prisma's migration status matches at deploy time.

- [ ] **Step 1.1.4: Verify types**

Run: `npx tsc --noEmit`
Expected: 0 errors. If the Prisma client didn't regenerate, `ownaExportedAt` will be missing from the type — rerun `npx prisma generate`.

- [ ] **Step 1.1.5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260422120000_add_enrolment_owna_exported_at/
git commit -m "feat(schema): add EnrolmentApplication.ownaExportedAt for OWNA CSV tracking"
```

---

### Task 1.2: `buildOwnaCsv` helper with unit tests

**Files:**
- Create: `src/lib/owna-csv.ts`
- Create: `src/__tests__/lib/owna-csv.test.ts`

- [ ] **Step 1.2.1: Write failing tests first**

Create `src/__tests__/lib/owna-csv.test.ts`:

```ts
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
      }),
    );
    // Any field with a quote or comma should be wrapped in quotes and have its quotes doubled
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
```

- [ ] **Step 1.2.2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/owna-csv.test.ts`
Expected: FAIL — `Cannot find module '@/lib/owna-csv'`.

- [ ] **Step 1.2.3: Implement the helper**

Create `src/lib/owna-csv.ts`:

```ts
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
  const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `enrolment-${safe(app.childFirstName)}-${safe(app.childLastName)}-${isoDate(now)}.csv`;
}
```

- [ ] **Step 1.2.4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/owna-csv.test.ts`
Expected: all pass (10 tests).

- [ ] **Step 1.2.5: Commit**

```bash
git add src/lib/owna-csv.ts src/__tests__/lib/owna-csv.test.ts
git commit -m "feat(lib): buildOwnaCsv helper for OWNA-importable enrolment export"
```

---

### Task 1.3: API route `GET /api/enrolment-applications/[id]/owna-csv`

**Files:**
- Create: `src/app/api/enrolment-applications/[id]/owna-csv/route.ts`
- Create: `src/__tests__/api/enrolment-applications-owna-csv.test.ts`

**Design (locked from pre-flight):** `CentreContact` has no address/phone columns. The route loads the most recent non-draft `EnrolmentSubmission` whose `primaryParent.email` matches the application's `family.email` (scoped to the same `serviceId`) and pulls address + mobile from the JSON payload. If no matching submission exists, the CSV exports with empty address fields (still useful — child name, DOB, medical notes, parent name+email all present).

- [ ] **Step 1.3.1: Write failing route tests**

Create `src/__tests__/api/enrolment-applications-owna-csv.test.ts` following the same mock pattern as `src/__tests__/api/enrolments.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/api-error", () => {
  class ApiError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
    static badRequest(message = "Bad request") { return new ApiError(400, message); }
    static notFound(message = "Not found") { return new ApiError(404, message); }
  }
  return {
    ApiError,
    parseJsonBody: async (req: Request) => {
      try { return await req.json(); }
      catch { throw ApiError.badRequest("Invalid or missing JSON body"); }
    },
  };
});

vi.mock("@/lib/api-handler", () => ({
  handleApiError: vi.fn((_req: unknown, err: unknown) => {
    const { NextResponse } = require("next/server");
    const status = (err as { statusCode?: number })?.statusCode ?? 500;
    const message = (err as { message?: string })?.message ?? "Internal error";
    return NextResponse.json({ error: message }, { status });
  }),
}));

// Fixture: CentreContact (family) has ONLY email, firstName, lastName, serviceId per pre-flight.
// Address/mobile come from EnrolmentSubmission.primaryParent JSON.
const APP_FIXTURE = {
  id: "app-1",
  serviceId: "svc-1",
  familyId: "fam-1",
  status: "pending",
  type: "sibling",
  childFirstName: "Ada",
  childLastName: "Lovelace",
  childDateOfBirth: new Date("2017-05-12"),
  childGender: "female",
  childSchool: "Amana Primary",
  childYear: "Year 2",
  sessionTypes: ["BSC"],
  startDate: new Date("2026-05-01"),
  medicalConditions: ["Asthma"],
  dietaryRequirements: [],
  medicationDetails: null,
  anaphylaxisActionPlan: null,
  additionalNeeds: null,
  consentPhotography: false,
  consentSunscreen: false,
  consentFirstAid: false,
  consentExcursions: false,
  copyAuthorisedPickups: true,
  copyEmergencyContacts: true,
  reviewedById: null,
  reviewedAt: null,
  declineReason: null,
  notes: null,
  createdChildId: null,
  ownaExportedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  family: {
    id: "fam-1",
    email: "grace@example.com",
    firstName: "Grace",
    lastName: "Lovelace",
    serviceId: "svc-1",
  },
};

const SUBMISSION_FIXTURE = {
  id: "sub-1",
  serviceId: "svc-1",
  status: "processed",
  primaryParent: {
    firstName: "Grace",
    surname: "Lovelace",
    email: "grace@example.com",
    mobile: "+61400000000",
    address: "1 Analytical Lane",
    suburb: "Coalbrook",
    state: "NSW",
    postcode: "2000",
  },
  secondaryParent: null,
  createdAt: new Date("2025-01-01"),
};

describe("GET /api/enrolment-applications/[id]/owna-csv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("rejects unauthenticated requests with 401", async () => {
    mockNoSession();
    const { GET } = await import(
      "@/app/api/enrolment-applications/[id]/owna-csv/route"
    );
    const res = await GET(
      createRequest("GET", "http://localhost/api/enrolment-applications/app-1/owna-csv"),
      { params: Promise.resolve({ id: "app-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("rejects below-coordinator roles (staff) with 403", async () => {
    // Note: `member` has the same rolePriority (2) as `coordinator`, so `staff` (1) is used instead.
    mockSession({ role: "staff", id: "u-1" });
    const { GET } = await import(
      "@/app/api/enrolment-applications/[id]/owna-csv/route"
    );
    const res = await GET(
      createRequest("GET", "http://localhost/api/enrolment-applications/app-1/owna-csv"),
      { params: Promise.resolve({ id: "app-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when application does not exist", async () => {
    mockSession({ role: "coordinator", id: "u-1" });
    prismaMock.enrolmentApplication.findUnique.mockResolvedValueOnce(null);
    const { GET } = await import(
      "@/app/api/enrolment-applications/[id]/owna-csv/route"
    );
    const res = await GET(
      createRequest("GET", "http://localhost/api/enrolment-applications/missing/owna-csv"),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with CSV + sets ownaExportedAt, pulling address from EnrolmentSubmission", async () => {
    mockSession({ role: "coordinator", id: "u-1" });
    prismaMock.enrolmentApplication.findUnique.mockResolvedValueOnce(APP_FIXTURE);
    prismaMock.enrolmentSubmission.findFirst.mockResolvedValueOnce(SUBMISSION_FIXTURE);
    prismaMock.enrolmentApplication.update.mockResolvedValueOnce({
      ...APP_FIXTURE,
      ownaExportedAt: new Date(),
    });

    const { GET } = await import(
      "@/app/api/enrolment-applications/[id]/owna-csv/route"
    );
    const res = await GET(
      createRequest("GET", "http://localhost/api/enrolment-applications/app-1/owna-csv"),
      { params: Promise.resolve({ id: "app-1" }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain("enrolment-ada-lovelace-");

    const body = await res.text();
    expect(body).toContain("first_name,last_name");
    expect(body).toContain("Ada");
    expect(body).toContain("Lovelace");
    expect(body).toContain("1 Analytical Lane");
    expect(body).toContain("Coalbrook");
    expect(body).toContain("grace@example.com");

    expect(prismaMock.enrolmentApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app-1" },
        data: expect.objectContaining({ ownaExportedAt: expect.any(Date) }),
      }),
    );
  });

  it("returns 200 with empty address when no matching EnrolmentSubmission exists", async () => {
    mockSession({ role: "coordinator", id: "u-1" });
    prismaMock.enrolmentApplication.findUnique.mockResolvedValueOnce(APP_FIXTURE);
    prismaMock.enrolmentSubmission.findFirst.mockResolvedValueOnce(null);
    prismaMock.enrolmentApplication.update.mockResolvedValueOnce({
      ...APP_FIXTURE,
      ownaExportedAt: new Date(),
    });

    const { GET } = await import(
      "@/app/api/enrolment-applications/[id]/owna-csv/route"
    );
    const res = await GET(
      createRequest("GET", "http://localhost/api/enrolment-applications/app-1/owna-csv"),
      { params: Promise.resolve({ id: "app-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    // Still contains the child + parent name + email from CentreContact
    expect(body).toContain("Ada");
    expect(body).toContain("Grace");
    expect(body).toContain("grace@example.com");
  });

  it("allows re-download (ownaExportedAt already set)", async () => {
    mockSession({ role: "owner", id: "u-1" });
    prismaMock.enrolmentApplication.findUnique.mockResolvedValueOnce({
      ...APP_FIXTURE,
      ownaExportedAt: new Date("2026-04-20"),
    });
    prismaMock.enrolmentSubmission.findFirst.mockResolvedValueOnce(SUBMISSION_FIXTURE);
    prismaMock.enrolmentApplication.update.mockResolvedValueOnce({
      ...APP_FIXTURE,
      ownaExportedAt: new Date(),
    });
    const { GET } = await import(
      "@/app/api/enrolment-applications/[id]/owna-csv/route"
    );
    const res = await GET(
      createRequest("GET", "http://localhost/api/enrolment-applications/app-1/owna-csv"),
      { params: Promise.resolve({ id: "app-1" }) },
    );
    expect(res.status).toBe(200);
  });
});
```

Run: `npx vitest run src/__tests__/api/enrolment-applications-owna-csv.test.ts`
Expected: FAIL — route file doesn't exist yet.

- [ ] **Step 1.3.2: Implement the route**

Create `src/app/api/enrolment-applications/[id]/owna-csv/route.ts`:

```ts
/**
 * GET /api/enrolment-applications/[id]/owna-csv
 *
 * Returns a single-row OWNA-importable CSV for the given enrolment
 * application. Sets ownaExportedAt = now() so admins can see which records
 * have been exported. Re-downloads update the timestamp.
 *
 * CentreContact (the `family` relation) stores only email + firstName + lastName.
 * Address and mobile live on EnrolmentSubmission.primaryParent JSON. We look up
 * the most recent non-draft submission for the same email + serviceId, and fall
 * back to empty strings if no match exists (child + parent name + email still
 * export — admin can fill address in OWNA's UI manually if needed).
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { buildOwnaCsv, ownaCsvFilename } from "@/lib/owna-csv";

interface SubmissionParentJson {
  firstName?: string;
  surname?: string;
  email?: string;
  mobile?: string;
  address?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
}

/**
 * Look up the most recent non-draft EnrolmentSubmission where
 * primaryParent.email (or secondaryParent.email) matches the provided email,
 * scoped to the given service. Returns the best matching parent JSON or null.
 */
async function loadParentContactJson(
  email: string,
  serviceId: string,
): Promise<SubmissionParentJson | null> {
  const emailLower = email.toLowerCase().trim();
  // We match via JSON path to keep the query efficient.
  const submission = await prisma.enrolmentSubmission.findFirst({
    where: {
      serviceId,
      status: { not: "draft" },
      OR: [
        { primaryParent: { path: ["email"], string_contains: emailLower } },
        { secondaryParent: { path: ["email"], string_contains: emailLower } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { primaryParent: true, secondaryParent: true },
  });
  if (!submission) return null;

  // Pick whichever slot matches this email.
  const primary = submission.primaryParent as SubmissionParentJson | null;
  const secondary = submission.secondaryParent as SubmissionParentJson | null;
  if (primary?.email?.toLowerCase().trim() === emailLower) return primary;
  if (secondary?.email?.toLowerCase().trim() === emailLower) return secondary;
  return primary ?? secondary;
}

export const GET = withApiAuth(
  async (req: NextRequest, _session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("Missing application ID");

    const application = await prisma.enrolmentApplication.findUnique({
      where: { id },
      include: {
        family: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!application) {
      throw ApiError.notFound("Application not found");
    }

    const contact = await loadParentContactJson(
      application.family.email,
      application.serviceId,
    );

    const csv = buildOwnaCsv({
      childFirstName: application.childFirstName,
      childLastName: application.childLastName,
      childDateOfBirth: application.childDateOfBirth,
      childGender: application.childGender,
      childSchool: application.childSchool,
      childYear: application.childYear,
      sessionTypes: application.sessionTypes,
      startDate: application.startDate,
      medicalConditions: application.medicalConditions,
      dietaryRequirements: application.dietaryRequirements,
      medicationDetails: application.medicationDetails,
      additionalNeeds: application.additionalNeeds,
      parent: {
        firstName: application.family.firstName ?? contact?.firstName ?? "",
        lastName: application.family.lastName ?? contact?.surname ?? "",
        email: application.family.email,
        phone: contact?.mobile ?? "",
        address: contact?.address ?? "",
        suburb: contact?.suburb ?? "",
        state: contact?.state ?? "",
        postcode: contact?.postcode ?? "",
      },
    });

    await prisma.enrolmentApplication.update({
      where: { id },
      data: { ownaExportedAt: new Date() },
    });

    const filename = ownaCsvFilename({
      childFirstName: application.childFirstName,
      childLastName: application.childLastName,
    });

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { minRole: "coordinator" },
);
```

- [ ] **Step 1.3.3: Run route tests**

Run: `npx vitest run src/__tests__/api/enrolment-applications-owna-csv.test.ts`
Expected: all pass (6 tests).

- [ ] **Step 1.3.4: Run full test suite**

Run: `npm test`
Expected: 1298 (baseline) + new tests pass; 0 new failures.

- [ ] **Step 1.3.5: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 1.3.6: Commit**

```bash
git add src/app/api/enrolment-applications/[id]/owna-csv/route.ts src/__tests__/api/enrolment-applications-owna-csv.test.ts
git commit -m "feat(api): GET /api/enrolment-applications/[id]/owna-csv download"
```

---

### Task 1.4: UI wiring — Download button + ownaExportedAt display

**Files:**
- Modify: `src/hooks/useEnrolmentApplications.ts`
- Modify: `src/app/api/enrolment-applications/[id]/route.ts`
- Modify: `src/components/enrolments/SiblingApplicationReviewPanel.tsx`

- [ ] **Step 1.4.1: Expose `ownaExportedAt` in the detail GET route**

Edit `src/app/api/enrolment-applications/[id]/route.ts` — in the response JSON, add:

```ts
      ownaExportedAt: application.ownaExportedAt?.toISOString() ?? null,
```

Place it immediately after the `createdChildId` field in the return object.

- [ ] **Step 1.4.2: Extend the hook type + add downloader**

Edit `src/hooks/useEnrolmentApplications.ts`:

1. Add `ownaExportedAt: string | null` to the `EnrolmentApplicationDetail` interface (after `createdChildId`).

2. Add a new exported hook at the bottom of the file:

```ts
/**
 * Download the OWNA-import CSV for an application. Triggers a browser
 * download on success and refreshes the detail query so the UI reflects
 * the new ownaExportedAt timestamp.
 */
export function useDownloadOwnaCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/enrolment-applications/${id}/owna-csv`);
      if (!res.ok) {
        let serverError = `Request failed with status ${res.status}`;
        try {
          const body = await res.json();
          serverError = body?.error ?? serverError;
        } catch {
          // non-JSON error body — ignore
        }
        throw new Error(serverError);
      }
      // Pull filename from Content-Disposition
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "enrolment.csv";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return { id, filename };
    },
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: ["enrolment-application", id] });
      queryClient.invalidateQueries({ queryKey: ["enrolment-applications"] });
      toast({ description: "OWNA CSV downloaded" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Failed to download CSV",
      });
    },
  });
}
```

Note: this uses raw `fetch` (not `fetchApi`) deliberately — `fetchApi` forces JSON parsing, but this endpoint returns a binary/text blob. The `onError` still meets the CLAUDE.md standard with a destructive toast.

- [ ] **Step 1.4.3: Add button + exported-on display to the review panel**

Edit `src/components/enrolments/SiblingApplicationReviewPanel.tsx`:

1. Extend the `lucide-react` import to include `Download`:
   ```tsx
   import {
     X,
     User,
     GraduationCap,
     Clock,
     Heart,
     Shield,
     Users,
     Check,
     AlertCircle,
     Download,
   } from "lucide-react";
   ```

2. Extend the hook import to include `useDownloadOwnaCsv`:
   ```tsx
   import {
     useEnrolmentApplicationDetail,
     useApproveEnrolmentApplication,
     useDeclineEnrolmentApplication,
     useDownloadOwnaCsv,
   } from "@/hooks/useEnrolmentApplications";
   ```

3. Add the mutation hook in the component body, alongside `approve` and `decline`:
   ```tsx
   const download = useDownloadOwnaCsv();
   ```

4. Inside the scrollable content (`<div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">`), insert this as the **first child**, before "Child Info":

   ```tsx
   {app?.ownaExportedAt && (
     <div className="flex items-center gap-2 text-xs text-foreground/60 bg-surface/50 rounded-lg px-3 py-2">
       <Check className="h-3.5 w-3.5 text-green-600" />
       Exported to OWNA on{" "}
       {new Date(app.ownaExportedAt).toLocaleDateString("en-AU", {
         day: "numeric",
         month: "short",
         year: "numeric",
       })}
     </div>
   )}
   ```

5. Restructure the footer so the download button is always visible and the existing approve/decline block only renders when `isPending`. **Current code (around line 232–303):**

   ```tsx
   {/* Action buttons */}
   {isPending && (
     <div className="shrink-0 px-6 py-4 border-t border-border bg-background space-y-3">
       {showApproveConfirm ? (
         <div className="space-y-3"> … </div>
       ) : showDeclineDialog ? (
         <div className="space-y-3"> … </div>
       ) : (
         <div className="flex gap-2"> … </div>
       )}
     </div>
   )}
   ```

   **New structure:** lift the wrapper out of the `isPending` gate; put the download button at the top; keep the existing approve/decline ternary unchanged inside a nested `{isPending && …}`:

   ```tsx
   {/* Action buttons — Download OWNA CSV is always available; approve/decline only when pending */}
   <div className="shrink-0 px-6 py-4 border-t border-border bg-background space-y-3">
     <button
       onClick={() => download.mutate(applicationId)}
       disabled={download.isPending}
       className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-foreground/80 border border-border rounded-lg hover:bg-surface transition-colors min-h-[44px] disabled:opacity-50"
     >
       <Download className="h-4 w-4" />
       {download.isPending
         ? "Downloading..."
         : app?.ownaExportedAt
           ? "Re-download OWNA CSV"
           : "Download OWNA CSV"}
     </button>

     {isPending && (
       showApproveConfirm ? (
         <div className="space-y-3"> … existing approve confirm UI unchanged … </div>
       ) : showDeclineDialog ? (
         <div className="space-y-3"> … existing decline dialog UI unchanged … </div>
       ) : (
         <div className="flex gap-2"> … existing approve/decline button row unchanged … </div>
       )
     )}
   </div>
   ```

   Copy the three existing branches verbatim from the current file into their new home — do not modify their contents. The only structural change is that the wrapping `<div>` and the Download button live outside the `isPending` gate.

- [ ] **Step 1.4.4: Manual smoke test**

Run: `npm run dev` (if not already running).

1. Log in as admin/coordinator.
2. Navigate to `/enrolments` → switch to the "Sibling" tab if needed → open any sibling application.
3. Click "Download OWNA CSV" — a file should download.
4. Re-open the same application — it should now show "Exported to OWNA on {date}" and the button label should read "Re-download OWNA CSV".

If no sibling application exists in dev data, create one via the sibling-enrolment form or manually via Prisma Studio. Document manual-test results for the PR body.

- [ ] **Step 1.4.5: Type check + tests**

Run (in parallel): `npx tsc --noEmit` and `npm test`
Expected: 0 tsc errors; all tests pass.

- [ ] **Step 1.4.6: Commit**

```bash
git add src/hooks/useEnrolmentApplications.ts src/app/api/enrolment-applications/[id]/route.ts src/components/enrolments/SiblingApplicationReviewPanel.tsx
git commit -m "feat(ui): Download OWNA CSV button on sibling enrolment review panel"
```

---

## Chunk 2: Parent portal end-to-end verification

### Task 2.1: Parent portal E2E helper

**Files:**
- Create: `tests/e2e/helpers/seed-parent-portal.ts`

The helper seeds a minimal `EnrolmentSubmission` (processed status, so `/api/parent/auth/verify` finds it), a `Child`, and a `ParentMagicLink` with a known token. Tests hit `/api/parent/auth/verify?token={rawToken}` directly, which sets the `parent-session` cookie.

**Important Playwright concern:** by default each `test()` gets a fresh browser context without carried cookies. The approach here mirrors `tests/e2e/owner-daily-flow.spec.ts`: (1) `beforeAll` seeds the DB and visits `/api/parent/auth/verify` in a throwaway APIRequestContext to get the session cookie, (2) that context is saved to a temporary storageState JSON file, (3) the authenticated `test.describe` block declares `test.use({ storageState })` so each test inside runs with the cookie loaded. Unauthenticated tests (login page, send-link API) live in a separate describe block with no storageState.

- [ ] **Step 2.1.1: Write the helper**

Create `tests/e2e/helpers/seed-parent-portal.ts`:

```ts
/**
 * Playwright seed helper — creates a known-state parent + child + magic link
 * so parent portal specs can authenticate deterministically (no real email).
 *
 * Usage in a spec's `test.beforeAll`:
 *   const seeded = await seedParent({});
 *   await saveParentSession(seeded, "./.playwright/auth/parent-portal.json");
 *   // Then in the spec:
 *   //   test.use({ storageState: "./.playwright/auth/parent-portal.json" });
 *   // Tests are now authenticated.
 */

import crypto from "crypto";
import { request as pwRequest } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Dedicated client — Playwright runs out-of-process from the app.
const prisma = new PrismaClient();

export interface SeededParent {
  email: string;
  parentName: string;
  serviceId: string;
  enrolmentId: string;
  childId: string;
  magicLinkId: string;
  rawToken: string;
}

export async function seedParent(input: {
  email?: string;
  parentFirstName?: string;
  parentLastName?: string;
  childFirstName?: string;
  childLastName?: string;
  serviceCode?: string;
}): Promise<SeededParent> {
  // crypto.randomUUID gives a stable-across-parallelism unique suffix.
  const unique = crypto.randomUUID().slice(0, 8);
  const email = (input.email ?? `e2e-parent+${unique}@amana-test.local`).toLowerCase();
  const parentFirstName = input.parentFirstName ?? "E2E";
  const parentLastName = input.parentLastName ?? "Parent";
  const childFirstName = input.childFirstName ?? "E2EChild";
  const childLastName = input.childLastName ?? "Surname";

  const service = await prisma.service.findFirstOrThrow({
    where: input.serviceCode ? { code: input.serviceCode } : {},
    select: { id: true },
  });

  // EnrolmentSubmission with primaryParent.email = seeded email (what /api/parent/auth/verify matches on).
  const enrolment = await prisma.enrolmentSubmission.create({
    data: {
      serviceId: service.id,
      status: "processed",
      primaryParent: {
        firstName: parentFirstName,
        surname: parentLastName,
        email,
        mobile: "+61400000001",
        address: "1 E2E Lane",
        suburb: "Testville",
        state: "NSW",
        postcode: "2000",
        relationship: "parent",
      },
      children: [
        {
          firstName: childFirstName,
          surname: childLastName,
          dob: "2018-05-12",
          gender: "female",
        },
      ],
      emergencyContacts: [],
      consents: {
        photography: true,
        sunscreen: true,
        firstAid: true,
        excursions: true,
      },
    // JSON columns have loose Prisma typing — `as never` silences the Input type warning.
    } as never,
  });

  // Child linked to the enrolment so /parent/children renders it.
  const child = await prisma.child.create({
    data: {
      firstName: childFirstName,
      surname: childLastName,
      dob: new Date("2018-05-12"),
      status: "active",
      serviceId: service.id,
      enrolmentId: enrolment.id,
    },
  });

  // Magic link with a known raw token.
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const magicLink = await prisma.parentMagicLink.create({
    data: {
      email,
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  return {
    email,
    parentName: `${parentFirstName} ${parentLastName}`,
    serviceId: service.id,
    enrolmentId: enrolment.id,
    childId: child.id,
    magicLinkId: magicLink.id,
    rawToken,
  };
}

/**
 * Visit /api/parent/auth/verify?token=... against the dev server so the
 * parent-session cookie is issued, then persist the browser context to
 * `storagePath` for use with `test.use({ storageState })`.
 */
export async function saveParentSession(
  seeded: SeededParent,
  storagePath: string,
  baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
): Promise<void> {
  const ctx = await pwRequest.newContext({ baseURL });
  // Disable redirect-following so we observe the Set-Cookie from the 302 response.
  const res = await ctx.get(`/api/parent/auth/verify?token=${seeded.rawToken}`, {
    maxRedirects: 0,
  }).catch(() => null);
  // Either we got a 302 with cookies, or (if maxRedirects isn't supported in
  // this Playwright version) we followed to /parent and the cookies are still
  // stored on the context. Both are fine.
  if (res) {
    // Consume body to avoid warnings; we only care about cookies.
    await res.text().catch(() => "");
  }
  await ctx.storageState({ path: storagePath });
  await ctx.dispose();
}

export async function cleanupParent(seeded: SeededParent): Promise<void> {
  await prisma.parentMagicLink.deleteMany({ where: { id: seeded.magicLinkId } }).catch(() => {});
  await prisma.child.deleteMany({ where: { id: seeded.childId } }).catch(() => {});
  await prisma.enrolmentSubmission.deleteMany({ where: { id: seeded.enrolmentId } }).catch(() => {});
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
```

**Note:** The `EnrolmentSubmission.primaryParent` JSON shape must match what `/api/parent/auth/verify` reads (`primary.email`, `primary.firstName`, `primary.surname` per `src/app/api/parent/auth/verify/route.ts:71-94`). The helper matches this. If the child page needs additional Child fields (e.g. `yearLevel`, `authorisedPickups`), extend the helper when those fields surface as spec failures.

- [ ] **Step 2.1.2: No commit yet**

This helper is useless without the spec that consumes it. Commit together in 2.2.

---

### Task 2.2: Parent portal E2E spec

**Files:**
- Create: `tests/e2e/parent-portal.spec.ts`

Cover these flows:
- Magic link request from `/parent/login` → success message
- Direct token verify (via seeded token) → redirected to `/parent`
- `/parent/children` — seeded child renders
- `/parent/children/[id]` — child detail renders without 500
- `/parent/messages` — list loads (may be empty)
- `/parent/account` — form loads; saving an empty change is a no-op 200
- Logout → redirects to `/parent/login`

- [ ] **Step 2.2.1: Write the spec**

Create `tests/e2e/parent-portal.spec.ts`. Pattern follows `tests/e2e/owner-daily-flow.spec.ts`: seed state once in `beforeAll`, save a storageState JSON, then `test.use({ storageState })` for authenticated tests. Unauthenticated tests (login page, send-link) live in a separate describe block with no storageState.

```ts
import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs/promises";
import {
  seedParent,
  saveParentSession,
  cleanupParent,
  disconnect,
  type SeededParent,
} from "./helpers/seed-parent-portal";

const STORAGE_STATE_PATH = path.join(
  __dirname,
  "..",
  "..",
  ".playwright",
  "auth",
  "parent-portal.json",
);

// Module-scoped so both describes can share.
let seeded: SeededParent;

test.beforeAll(async () => {
  seeded = await seedParent({});
  await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await saveParentSession(seeded, STORAGE_STATE_PATH);
});

test.afterAll(async () => {
  if (seeded) await cleanupParent(seeded);
  await disconnect();
  // Best-effort: remove the storage state file
  await fs.unlink(STORAGE_STATE_PATH).catch(() => {});
});

test.describe("Parent portal — unauthenticated", () => {
  test("login page renders the magic-link form", async ({ page }) => {
    await page.goto("/parent/login");
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /send|continue|link|sign/i })).toBeVisible();
  });

  test("POST send-link returns success for a known email", async ({ request }) => {
    const res = await request.post("/api/parent/auth/send-link", {
      data: { email: seeded.email },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("POST send-link returns success for an unknown email (no enumeration)", async ({ request }) => {
    const res = await request.post("/api/parent/auth/send-link", {
      data: { email: "definitely-not-a-parent@example.invalid" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

test.describe("Parent portal — authenticated round-trip", () => {
  test.use({ storageState: STORAGE_STATE_PATH });

  test("home page renders after auth", async ({ page }) => {
    await page.goto("/parent");
    await expect(page).toHaveURL(/\/parent\/?$/);
    await expect(page.locator("header, nav").first()).toBeVisible({ timeout: 10_000 });
  });

  test("children list shows seeded child", async ({ page }) => {
    await page.goto("/parent/children");
    await expect(page.getByText("E2EChild", { exact: false })).toBeVisible({ timeout: 10_000 });
  });

  test("child detail page loads without error", async ({ page }) => {
    await page.goto(`/parent/children/${seeded.childId}`);
    await expect(page.locator("h1, h2, h3").first()).toBeVisible();
    await expect(page.getByText(/something went wrong|500/i)).toHaveCount(0);
  });

  test("messages page loads", async ({ page }) => {
    await page.goto("/parent/messages");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/something went wrong|500/i)).toHaveCount(0);
  });

  test("account page loads and form is present", async ({ page }) => {
    await page.goto("/parent/account");
    await expect(page.locator("form, input").first()).toBeVisible({ timeout: 10_000 });
  });

  test("logout clears the session and returns to /parent/login", async ({ page, context }) => {
    await page.goto("/parent");
    const logout = page.getByRole("button", { name: /log ?out/i });
    await logout.waitFor({ state: "visible", timeout: 10_000 });
    await logout.click();
    await expect(page).toHaveURL(/\/parent\/login/, { timeout: 10_000 });
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "parent-session");
    expect(session?.value ?? "").toBe("");
  });
});
```

Selectors may need tweaking for reality. **Before claiming this passes, run the spec and fix selectors that don't match the real DOM** (text content, headings, button labels). Each failing expectation is evidence the portal UI differs from what this plan assumes — fix the spec OR the portal code depending on which is wrong. Document bug fixes in the PR body ("how I verified the portal end-to-end").

- [ ] **Step 2.2.2: Run the spec against the dev server**

Ensure dev server is running (`npm run dev`). Then:

Run: `npm run test:e2e -- parent-portal`
Expected: If any test fails, inspect the failure. Playwright's trace and screenshot will be at `test-results/`. Decide per-failure:
- Selector mismatch → fix the spec.
- Real bug (500, missing data, broken redirect) → fix the portal code. Document in PR body.
- Missing seed — e.g. if `/parent/children` expects additional data — extend `seedParent`.

**Escalation cap:** if more than 3 distinct portal bugs surface, stop and surface them to Jayden before continuing. This keeps the scope-creep risk visible. Otherwise iterate until all 9 tests pass.

- [ ] **Step 2.2.3: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2.2.4: Commit the spec + helper (and any portal bug fixes)**

Two commits in sequence:

```bash
# 1. If any portal fixes were made, commit those first
git add -u src/app/parent src/app/api/parent  # whatever files changed
git commit -m "fix(portal): <short description of what broke and how it was fixed>"

# 2. Then commit the E2E spec + helper
git add tests/e2e/parent-portal.spec.ts tests/e2e/helpers/seed-parent-portal.ts
git commit -m "test(e2e): Playwright coverage for parent portal round-trip"
```

If no portal bugs were found, skip the first commit and ship only the E2E spec. Include a brief note in the PR body.

---

## Chunk 3: WeeklyDataEntry migration + final verification

### Task 3.1: Migrate `WeeklyDataEntry` to `fetchApi`/`mutateApi`

**Files:**
- Modify: `src/components/services/WeeklyDataEntry.tsx`

- [ ] **Step 3.1.1: Replace the GET fetch**

Edit `src/components/services/WeeklyDataEntry.tsx`. At the top, add:

```ts
import { fetchApi, mutateApi } from "@/lib/fetch-api";
```

Replace the existing `useQuery<WeeklyRecord[]>` block:

```ts
  // Fetch existing data
  const { data: records } = useQuery<WeeklyRecord[]>({
    queryKey: ["weekly-data", serviceId],
    queryFn: () => fetchApi(`/api/services/${serviceId}/weekly-data`),
    retry: 2,
    staleTime: 30_000,
  });
```

Note: the original `useQuery` lacked `retry: 2` and `staleTime` — add both per CLAUDE.md standards.

- [ ] **Step 3.1.2: Replace the POST fetch in the mutation**

Replace the `submitWeekly` mutation's `mutationFn`:

```ts
  const submitWeekly = useMutation({
    mutationFn: () =>
      mutateApi(`/api/services/${serviceId}/weekly-data`, {
        method: "POST",
        body: {
          weekOf: selectedWeek.toISOString(),
          bscRecurring,
          bscCasual,
          ascRecurring,
          ascCasual,
          vcAttendance,
          staffCosts,
          foodCosts,
          suppliesCosts,
          otherCosts,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekly-data", serviceId] });
      queryClient.invalidateQueries({ queryKey: ["financials"] });
      queryClient.invalidateQueries({ queryKey: ["service", serviceId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
```

The `onError` was already correct; no change there.

- [ ] **Step 3.1.3: Manual smoke test in dev**

1. `npm run dev` running.
2. Log in as a role with service access. Navigate to `/services/[id]` → find the weekly-data widget.
3. Submit a weekly record → a success toast or form reset should appear; data reappears in the history table.
4. Force an error (temporarily POST to a bad URL in DevTools) — the toast now shows a server error message instead of "Failed to submit".

- [ ] **Step 3.1.4: Type check + tests**

Run (parallel): `npx tsc --noEmit` and `npm test`
Expected: 0 tsc errors; all tests pass.

- [ ] **Step 3.1.5: Commit**

```bash
git add src/components/services/WeeklyDataEntry.tsx
git commit -m "refactor(components): WeeklyDataEntry fetch -> mutateApi"
```

---

### Task 3.2: Final verification

- [ ] **Step 3.2.1: Full build**

Run: `npm run build`
Expected: build succeeds. Any new type errors or missing env vars are blockers — fix before continuing.

- [ ] **Step 3.2.2: Lint**

Run: `npm run lint`
Expected: 0 errors. If there are warnings from new files, address them.

- [ ] **Step 3.2.3: Full unit/integration test suite**

Run: `npm test`
Expected: 1298 (baseline) + ~15 new unit tests = ~1313+.

- [ ] **Step 3.2.4: Full E2E suite**

Run: `npm run test:e2e`
Expected: baseline specs still pass; new `parent-portal.spec.ts` passes. ~9 new E2E tests.

- [ ] **Step 3.2.5: Commit count check**

Run: `git log --oneline main..HEAD`
Expected: 6 commits (possibly 7 if a portal bug fix commit landed between 2.1 and 2.2).

- [ ] **Step 3.2.6: Summary**

Write a short session summary to a scratch file or note in the PR body:
- New tests added
- Any portal bugs found + fixed
- Any deviations from the spec (e.g. column-set tweaks, lookup logic choice)

---

## Acceptance criteria (from the spec)

- [x] All 6 (or 6–7) commits land in order
- [x] Schema migration file created (applied to Neon **post**-merge by Jayden)
- [x] 1298 → ~1313+ unit tests; +9 E2E tests
- [x] 0 tsc errors
- [x] "Download OWNA CSV" button on the sibling review panel; tracks `ownaExportedAt`; supports re-download
- [x] Playwright parent-portal round-trip passes
- [x] PR body includes an end-to-end verification log + any bugs fixed + OWNA CSV column list for Jayden to tweak

---

## Risks + mitigations

- **OWNA CSV column set is a guess**: Jayden's PR-body note highlights the columns so he can reshape in one file. `OWNA_CSV_COLUMNS` is exported for external tooling.
- **`CentreContact` may not carry address fields**: Task 1.3.1 verifies this first; the route falls back to `EnrolmentSubmission.primaryParent` JSON if the fields aren't on `CentreContact`.
- **Playwright flake**: seed uses a unique email per run (`Date.now()`), so parallel or repeated runs don't collide. Each test uses a short 10s timeout for `expect(...).toBeVisible()` to fail loudly rather than hang.
- **Migration safety**: single nullable additive field. No backfill. Re-runnable. Rollback is `ALTER TABLE "EnrolmentApplication" DROP COLUMN "ownaExportedAt";`.

## Rollback

- Revert the PR. No data loss (the only written field is a timestamp; dropping the column destroys only "when exported" info, not the CSV payload).

---

## Execution notes

- No new env vars.
- No new deps.
- Does not change cowork API, auth, or roster surfaces (sub-project 5 + 9 can merge either before or after this).
- **Parallel-merge hotspots** are minimal — this PR only touches `prisma/schema.prisma` (single additive line). Rebase on `origin/main` before merging.
