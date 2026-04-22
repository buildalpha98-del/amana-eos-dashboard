# Contracts + Recruitment Rebuild (Sub-project 6) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. Each commit ships as an independent unit behind its own spec-reviewer + code-quality-reviewer gate.

**Goal:** Close UI + wiring gaps in the existing Contracts + Recruitment modules — decompose the 1148-line `contracts/page.tsx`, add contract PDF upload/download, wire contract-acknowledge to auto-seed onboarding, expose `/contracts` properly in nav + `/staff/[id]`, ship AI candidate screening + CandidateDetailPanel + Staff Referrals workflow, and enforce previously-unwired `contracts.edit` / new `recruitment.*` feature gates.

**Architecture:** Additive schema (1 nullable field on `StaffReferral`), stacked commits, each revert-safe. Reuses existing infra: `withApiAuth`, `ApiError`, `parseJsonBody`, `fetchApi` / `mutateApi`, `useAiGenerate`, `AiButton`, `AiDraftReviewPanel`, `logger`. No new top-level pages — enhances existing `/contracts`, `/recruitment`, `/staff/[id]`.

**Tech Stack:** Next.js 16, Prisma 5.22 / PostgreSQL, TypeScript, React Query, Zod, Vitest, Playwright, Tailwind + shadcn, Anthropic SDK (for AI screening).

---

## Pre-flight baseline (run before Commit 1)

Before starting, verify clean baseline on the worktree branch:

```bash
git rev-parse HEAD                       # match plan's base (should be 4ce6f2a or later)
npx tsc --noEmit 2>&1 | grep -c "error TS"   # expect 0
npm test -- --run 2>&1 | tail -3         # expect "Tests  X passed" (1617+ baseline)
```

If any fail, STOP and report.

## Surprises noted during planning (apply before execution)

The spec was pre-written; code has drifted since. These are the concrete deltas the implementer must honor:

1. **`/contracts` is already in `nav-config.ts`** (line 106, People section) — 4a already wired this. So Commit 5's work is narrower than the spec implied: verify role gating is correct, add the `hasFeature("contracts.view")` visibility gate in the Sidebar filter, and optionally add a small help link. DO NOT add a duplicate nav entry.
2. **`contracts.view` currently includes: owner, head_office, admin, member, staff** (not marketing). Marketing does NOT have `contracts.view` today. The pre-step audit should confirm this and leave it alone. If the audit surfaces marketing unexpectedly having it, narrow it then.
3. **`useRecruitment.ts` does NOT exist.** Recruitment page + components use raw `fetch()` inline. Commit 10 test sweep should include adding this hook (and optimistic mutation) per CLAUDE.md standards. Commits 6–8 will need their own hooks wired incrementally.
4. **`src/lib/ai.ts` only exports `getAI()`** (returns `Anthropic | null`). There is no `generateText` function. Commit 6 will add a thin `generateText(prompt, opts)` function at the module boundary so tests can mock it cleanly. This is additive and safe.
5. **`StaffProfileTabs` valid keys are:** `overview, personal, employment, leave, timesheet, compliance, documents`. Commit 4 adds `"contracts"` to that union and the `VALID_TABS` set in `src/app/(dashboard)/staff/[id]/page.tsx`.
6. **`/contracts` is in `allPages` but marketing's `rolePageAccess` does NOT include `/contracts`** (good). Verified.
7. **Upload flow:** `POST /api/documents` does NOT accept FormData — it's a JSON route that takes `{ title, fileName, fileUrl, category, ... }`. The repo's generic FormData uploader is `POST /api/upload` which accepts `multipart/form-data` (file field), allowed-types list including `application/pdf`, 10MB cap, magic-byte validation, returns `{ fileName, fileUrl, fileSize, mimeType }`. Commit 2 uses `/api/upload` only — contracts store the URL directly in `EmploymentContract.documentUrl`; `documentId` stays null (we don't need a Document record for contract PDFs in this scope).
8. **OnboardingPack names (seeded via `POST /api/onboarding/seed`):** `"New Educator Induction"` (isDefault:true), `"Centre Coordinator Induction"`, `"Casual / Relief Educator Induction"`, `"Administration / Office Staff Induction"`, `"Volunteer / Student Placement Induction"`, `"Annual Staff Compliance Renewal"`. The Commit 3 mapping uses these exact names — if packs haven't been seeded on a given environment (Neon prod), the resolver gracefully logs warn + returns null; the acknowledge call still succeeds.
9. **`withApiAuth` options composition:** `{ roles, minRole, feature, rateLimit }` — all AND-composed. For writes in Commit 9 we use `feature` only (remove `roles`) so role-permissions.ts is the single source of truth. For GETs we keep `roles` to explicitly include coordinator.

## Migration artefact

A single migration needs to be applied to Neon before merge:

```sql
-- File: migrations/manual/2026-04-22-contracts-recruitment-6.sql
ALTER TABLE "StaffReferral" ADD COLUMN "lastReminderAt" TIMESTAMP(3);
```

- No indexes on this column (low-cardinality, nullable, never queried hot).
- Generated via `npx prisma migrate dev --create-only --name add_referral_last_reminder_at` after editing `prisma/schema.prisma`.
- PR body includes the exact SQL. User applies to Neon before merging.

---

## Chunk 1: Commit 1 — refactor `contracts/page.tsx`

**Goal:** Extract the 1148-line monolith into 5 focused components with zero behavioural drift. Write smoke snapshot test BEFORE extraction; re-run after to prove nothing changed.

### File structure for this commit

```
src/app/(dashboard)/contracts/page.tsx                   (shrinks: 1148 → ~220 lines of composition only)
src/components/contracts/ContractsTable.tsx              (NEW ~180 lines — list + filter + search UI)
src/components/contracts/ContractDetailPanel.tsx         (NEW ~260 lines — right-side panel: timeline, actions)
src/components/contracts/NewContractModal.tsx            (NEW ~180 lines — form for create flow)
src/components/contracts/SupersedeContractModal.tsx      (NEW ~170 lines — reuses form in "supersede" variant)
src/components/contracts/TerminateContractDialog.tsx     (NEW ~90 lines — confirm dialog)
src/__tests__/components/contracts-page.smoke.test.tsx   (NEW ~120 lines — smoke snapshot test)
```

### Task 1.1: Write the smoke snapshot test (BEFORE any extraction)

**Files:**
- Create: `src/__tests__/components/contracts-page.smoke.test.tsx`

This is a pre-extraction regression guard. It renders the current page with mocked hooks and snapshots 3 UX states: list (with 2 mock contracts), "+ New contract" modal open, detail panel open with a selected contract. The snapshots become the invariant we protect during decomposition.

- [ ] **Step 1: Write the smoke test**

```tsx
// src/__tests__/components/contracts-page.smoke.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock next-auth
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", role: "owner" } },
    status: "authenticated",
  }),
}));

// Mock hooks
vi.mock("@/hooks/useContracts", () => ({
  useContracts: () => ({
    data: [
      {
        id: "c-1",
        userId: "u-staff-1",
        user: { id: "u-staff-1", name: "Amira Test", email: "amira@test.com", avatar: null },
        contractType: "ct_permanent",
        awardLevel: "es2",
        awardLevelCustom: null,
        payRate: 35.5,
        hoursPerWeek: 38,
        startDate: "2026-01-15",
        endDate: null,
        status: "active",
        documentUrl: null,
        documentId: null,
        signedAt: null,
        acknowledgedByStaff: true,
        acknowledgedAt: "2026-01-20T00:00:00Z",
        notes: null,
        previousContractId: null,
        createdAt: "2026-01-15T00:00:00Z",
        updatedAt: "2026-01-20T00:00:00Z",
      },
      {
        id: "c-2",
        userId: "u-staff-2",
        user: { id: "u-staff-2", name: "Bilal Test", email: "bilal@test.com", avatar: null },
        contractType: "ct_casual",
        awardLevel: null,
        awardLevelCustom: null,
        payRate: 32.0,
        hoursPerWeek: null,
        startDate: "2026-03-01",
        endDate: null,
        status: "contract_draft",
        documentUrl: null,
        documentId: null,
        signedAt: null,
        acknowledgedByStaff: false,
        acknowledgedAt: null,
        notes: null,
        previousContractId: null,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      },
    ],
    isLoading: false,
    error: null,
  }),
  useContract: () => ({ data: null, isLoading: false, error: null }),
  useCreateContract: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateContract: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSupersedeContract: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useTerminateContract: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useAcknowledgeContract: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

// Mock tanstack useQuery for user-options query (page uses it directly)
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: [
        { id: "u-staff-1", name: "Amira Test", email: "amira@test.com", role: "staff" },
        { id: "u-staff-2", name: "Bilal Test", email: "bilal@test.com", role: "staff" },
      ],
      isLoading: false,
      error: null,
    })),
  };
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("contracts page smoke", () => {
  it("renders list with two mocked contracts (pre-refactor invariant)", async () => {
    const { default: ContractsPage } = await import("@/app/(dashboard)/contracts/page");
    render(wrap(<ContractsPage />));
    expect(screen.getByText("Amira Test")).toBeInTheDocument();
    expect(screen.getByText("Bilal Test")).toBeInTheDocument();
    // Status labels
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    // New contract CTA
    expect(screen.getByRole("button", { name: /new contract/i })).toBeInTheDocument();
    // Search input
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect PASS on un-refactored page**

Run: `npm test -- --run src/__tests__/components/contracts-page.smoke.test.tsx`
Expected: PASS. This is the invariant snapshot — the extraction must preserve this.

- [ ] **Step 3: Leave the new test file uncommitted for now.** The smoke test AND the refactor land together as one `refactor(contracts):` commit (Step 12). This way the PR shows "guard test + refactor together" — a reviewer can confirm the guard test ran against the pre-refactor page in CI history (it runs against every commit from this one forward).

### Task 1.2: Extract `ContractsTable.tsx`

**Files:**
- Create: `src/components/contracts/ContractsTable.tsx`

This component owns: list rendering, search input, filter dropdowns (status / contractType / serviceId), the row-click handler (delegated back up to parent). Parent retains state; this component is a controlled view.

- [ ] **Step 4: Extract list + filters into `ContractsTable.tsx`**

Signature:

```tsx
interface Props {
  contracts: ContractData[];
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  contractTypeFilter: string;
  onContractTypeFilterChange: (v: string) => void;
  selectedContractId: string | null;
  onSelectContract: (id: string) => void;
  isLoading: boolean;
  error: Error | null;
}
```

Copy the list + filter JSX verbatim from current `page.tsx` lines ~800–1100 (approximately — match the existing markup). Extract the filter constants (STATUS_CONFIG, CONTRACT_TYPE_LABELS, AWARD_LEVEL_LABELS) to a shared `src/components/contracts/constants.ts` file that both table and detail import.

Create: `src/components/contracts/constants.ts`

```ts
export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  ct_casual: "Casual",
  ct_part_time: "Part-Time",
  ct_permanent: "Permanent",
  ct_fixed_term: "Fixed Term",
};

export const AWARD_LEVEL_LABELS: Record<string, string> = {
  es1: "Education Support L1", es2: "Education Support L2",
  es3: "Education Support L3", es4: "Education Support L4",
  cs1: "Children's Services L1", cs2: "Children's Services L2",
  cs3: "Children's Services L3", cs4: "Children's Services L4",
  director: "Director", coordinator: "Coordinator", custom: "Custom",
};

export const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  contract_draft: { label: "Draft", bg: "bg-surface", text: "text-foreground/80", dot: "bg-gray-400" },
  active: { label: "Active", bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  superseded: { label: "Superseded", bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
  terminated: { label: "Terminated", bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" },
};

export const CONTRACT_TYPES = ["ct_casual", "ct_part_time", "ct_permanent", "ct_fixed_term"];
export const AWARD_LEVELS = ["es1","es2","es3","es4","cs1","cs2","cs3","cs4","director","coordinator","custom"];

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(amount);
}
export function daysUntilDate(dateStr: string): number {
  const now = new Date(); now.setHours(0,0,0,0);
  const target = new Date(dateStr); target.setHours(0,0,0,0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
export function getAwardLabel(level: string | null, custom: string | null): string {
  if (!level) return "N/A";
  if (level === "custom") return custom || "Custom";
  return AWARD_LEVEL_LABELS[level] || level;
}
```

Also extract `StatusBadge` and `AcknowledgeBadge` into their own small components in `src/components/contracts/badges.tsx` so every view uses the same rendering.

### Task 1.3: Extract `ContractDetailPanel.tsx`

**Files:**
- Create: `src/components/contracts/ContractDetailPanel.tsx`

Props:

```tsx
interface Props {
  contractId: string | null;
  onClose: () => void;
  onSupersede: (contract: ContractDetail) => void;
  onTerminate: (contract: ContractDetail) => void;
  onEdit: (contract: ContractDetail) => void;
  canEdit: boolean;              // caller computes: hasMinRole(role, "admin")
  canAcknowledgeSelf: boolean;   // caller computes: contract.userId === session.user.id
}
```

Owns: fetching via `useContract(contractId)`, rendering the right-side panel (timeline, award, pay, acknowledge button, supersede/terminate CTAs). Parent owns modal visibility state.

- [ ] **Step 5: Move detail panel JSX into the new component.** Line-for-line copy; rename only the top-level function and update imports. Run `npm run build` after this step to catch any reference-broken imports.

### Task 1.4: Extract `NewContractModal.tsx` + `SupersedeContractModal.tsx`

**Files:**
- Create: `src/components/contracts/NewContractModal.tsx`
- Create: `src/components/contracts/SupersedeContractModal.tsx`

The current page has one `ContractFormModal` component that's used for both new + supersede. Extract it into `ContractFormModal` as a shared internal component, then wrap with two thin named exports for the two use cases.

Option (cleaner): move the shared form into `src/components/contracts/ContractFormFields.tsx` (pure fields component), and have each modal wrap with its own header/submit handler. Use this approach — it's easier to test and reason about.

```
src/components/contracts/ContractFormFields.tsx    (shared fields — no modal chrome)
src/components/contracts/NewContractModal.tsx      (wraps + wires useCreateContract)
src/components/contracts/SupersedeContractModal.tsx (wraps + wires useSupersedeContract, with "previous contract" indicator banner)
```

- [ ] **Step 6: Extract `ContractFormFields` + two modal wrappers.** Keep exact same prop API as existing page so parent composition stays stable.

### Task 1.5: Extract `TerminateContractDialog.tsx`

**Files:**
- Create: `src/components/contracts/TerminateContractDialog.tsx`

Thin dialog — confirm message + optional notes textarea + optional endDate picker + "Terminate" destructive button.

- [ ] **Step 7: Extract terminate dialog.**

### Task 1.6: Compose — shrink parent `page.tsx`

**Files:**
- Modify: `src/app/(dashboard)/contracts/page.tsx` (target ~220 lines)

Parent now handles:
- useSession + role gate guard
- state (selectedContractId, showNewModal, showSupersedeModal, showTerminateDialog)
- The three filters (passed down to ContractsTable)
- Fetch user options (admin list for the form selects)
- Renders: PageHeader + ContractsTable + conditional {ContractDetailPanel, NewContractModal, SupersedeContractModal, TerminateContractDialog}

- [ ] **Step 8: Rewrite `page.tsx` as composition only.** Delete extracted JSX blocks. Verify total line count ≤ 250.

- [ ] **Step 9: Run smoke test — expect PASS (same output as before extraction)**

Run: `npm test -- --run src/__tests__/components/contracts-page.smoke.test.tsx`
Expected: PASS — proves zero behavioural drift.

- [ ] **Step 10: Build passes**

Run: `npm run build`
Expected: no errors, no new warnings.

- [ ] **Step 11: tsc clean**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 0.

- [ ] **Step 12: Commit**

```bash
git add src/app/\(dashboard\)/contracts/page.tsx \
  src/components/contracts/ContractsTable.tsx \
  src/components/contracts/ContractDetailPanel.tsx \
  src/components/contracts/NewContractModal.tsx \
  src/components/contracts/SupersedeContractModal.tsx \
  src/components/contracts/TerminateContractDialog.tsx \
  src/components/contracts/ContractFormFields.tsx \
  src/components/contracts/constants.ts \
  src/components/contracts/badges.tsx \
  src/__tests__/components/contracts-page.smoke.test.tsx
git commit -m "refactor(contracts): extract ContractsTable + DetailPanel + modals from page.tsx"
```

---

## Chunk 2: Commit 2 — contract PDF upload + download

**Goal:** Wire `documentUrl` (already in schema) to an upload flow in `NewContractModal` / `SupersedeContractModal` and a "View signed contract" button in `ContractDetailPanel`.

**Upload infra note (CRITICAL):** This repo has a two-layer upload flow:
- `POST /api/upload` — accepts FormData, uploads to Vercel Blob via `uploadFile` helper, returns `{ fileName, fileUrl, fileSize, mimeType }`. Allowed types include `application/pdf`, 10MB cap enforced, magic-byte content validation via `validateFileContent`.
- `POST /api/documents` — accepts JSON body (`{ title, fileName, fileUrl, category, ... }`), creates a `Document` record. Does NOT accept raw file bytes.

**Decision for contracts:** Use `POST /api/upload` only. Store the returned `fileUrl` in `EmploymentContract.documentUrl`. Leave `documentId` nullable/empty for now — we do not need a full `Document` record for contracts in this sub-project; the URL alone gives download + audit (the contract is the primary record). This keeps scope tight and matches how avatars + enrolment files work.

### File structure for this commit

```
src/components/contracts/ContractFormFields.tsx       (modify: add file input + upload handler targeting /api/upload)
src/components/contracts/ContractDetailPanel.tsx      (modify: add "View signed contract" link when documentUrl is set)
src/app/api/contracts/[id]/route.ts                    (verify: PATCH already accepts documentUrl + documentId — confirm Zod allows them)
src/__tests__/components/contract-upload.test.tsx     (NEW ~100 lines — unit test upload flow)
```

### Task 2.1: Verify `POST /api/upload` contract for PDFs

- [ ] **Step 1: Confirmed during planning** — `src/app/api/upload/route.ts`:
  - Accepts `multipart/form-data` with `file` field
  - `ALLOWED_TYPES` includes `application/pdf`
  - `MAX_SIZE` = 10 * 1024 * 1024 (matches our requirement)
  - Runs `validateFileContent(bytes, file.type)` (magic-byte sniff — PDFs must start with `%PDF`)
  - Returns `{ fileName, fileUrl, fileSize, mimeType }`

No changes needed on the upload route.

### Task 2.2: Write failing test — upload flow

**Files:**
- Create: `src/__tests__/components/contract-upload.test.tsx`

- [ ] **Step 2: Write failing test for upload wiring.**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContractFormFields } from "@/components/contracts/ContractFormFields";

beforeEach(() => {
  global.fetch = vi.fn(async () =>
    ({
      ok: true,
      json: async () => ({
        fileName: "signed.pdf",
        fileUrl: "https://blob.vercel.com/signed-abc.pdf",
        fileSize: 1234,
        mimeType: "application/pdf",
      }),
    } as Response)
  );
});

describe("ContractFormFields upload", () => {
  it("uploads PDF to /api/upload and calls onChange with documentUrl", async () => {
    const handleChange = vi.fn();
    const file = new File(["%PDF-bytes"], "signed.pdf", { type: "application/pdf" });
    render(
      <ContractFormFields
        users={[]}
        value={{
          userId: "", contractType: "ct_permanent", awardLevel: "", awardLevelCustom: "",
          payRate: "", hoursPerWeek: "", startDate: "", endDate: "", notes: "",
          documentUrl: null, documentId: null,
        }}
        onChange={handleChange}
        disableUserSelect={false}
      />
    );
    const input = screen.getByLabelText(/signed contract pdf/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({ documentUrl: "https://blob.vercel.com/signed-abc.pdf" })
      )
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/upload",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("rejects non-PDF files with inline error (client-side)", async () => {
    const handleChange = vi.fn();
    const file = new File(["img"], "cat.png", { type: "image/png" });
    render(
      <ContractFormFields
        users={[]}
        value={{ userId: "", contractType: "ct_permanent", awardLevel: "", awardLevelCustom: "", payRate: "", hoursPerWeek: "", startDate: "", endDate: "", notes: "", documentUrl: null, documentId: null }}
        onChange={handleChange}
        disableUserSelect={false}
      />
    );
    const input = screen.getByLabelText(/signed contract pdf/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/pdf only/i)).toBeInTheDocument());
    expect(handleChange).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("surfaces server-side errors inline when upload returns 400", async () => {
    global.fetch = vi.fn(async () =>
      ({ ok: false, status: 400, json: async () => ({ error: "File content does not match declared type" }) } as Response)
    );
    const handleChange = vi.fn();
    const file = new File(["fake-pdf"], "bad.pdf", { type: "application/pdf" });
    render(
      <ContractFormFields
        users={[]}
        value={{ userId: "", contractType: "ct_permanent", awardLevel: "", awardLevelCustom: "", payRate: "", hoursPerWeek: "", startDate: "", endDate: "", notes: "", documentUrl: null, documentId: null }}
        onChange={handleChange}
        disableUserSelect={false}
      />
    );
    const input = screen.getByLabelText(/signed contract pdf/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/does not match/i)).toBeInTheDocument());
    expect(handleChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (component doesn't have upload input yet).

### Task 2.3: Add upload input + handler

**Files:**
- Modify: `src/components/contracts/ContractFormFields.tsx`

- [ ] **Step 4: Add file input + client-side validation + upload-on-change.**

Rules:
- Accept only `application/pdf`. Show inline error `PDF only, max 10MB` for violations.
- Size limit: 10 * 1024 * 1024 bytes.
- Upload via `fetch("/api/upload", { method: "POST", body: formData })`. Keep FormData upload raw — this is the documented exception to `fetchApi`.
- On success (response `{ fileName, fileUrl, fileSize, mimeType }`), call `onChange` with `documentUrl: fileUrl` and `documentId: null` merged into the form value.
- Show "Uploading…" state with disabled input.
- If the form already has a `documentUrl` (editing a contract with a signed PDF), show "Replace PDF" button + "View current PDF" link.

Structure:

```tsx
export interface ContractFormValue {
  userId: string;
  contractType: string;
  awardLevel: string;
  awardLevelCustom: string;
  payRate: string;
  hoursPerWeek: string;
  startDate: string;
  endDate: string;
  notes: string;
  documentUrl: string | null;
  documentId: string | null;
}

interface Props {
  users: UserOption[];
  value: ContractFormValue;
  onChange: (next: ContractFormValue) => void;
  disableUserSelect?: boolean;
}
```

Internal upload handler:

```tsx
async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.type !== "application/pdf") {
    setUploadError("PDF only");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setUploadError("PDF too large (max 10MB)");
    return;
  }
  setUploadError(null);
  setUploading(true);
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(body.error ?? "Upload failed");
    }
    const { fileUrl } = await res.json();
    onChange({ ...value, documentUrl: fileUrl, documentId: null });
  } catch (err) {
    setUploadError(err instanceof Error ? err.message : "Upload failed");
  } finally {
    setUploading(false);
  }
}
```

**Note:** `documentId` stays `null` — contracts store the URL directly. The `EmploymentContract.documentId` FK remains available for future use (if we later want a Document record for indexed search / folder browsing).

- [ ] **Step 5: Run tests — expect PASS.**

### Task 2.4: Add "View signed contract" link in ContractDetailPanel

- [ ] **Step 6: In `ContractDetailPanel.tsx`, add a "View signed contract" button (shows only when `documentUrl` is set) that opens the URL in a new tab.**

```tsx
{contract.documentUrl && (
  <a
    href={contract.documentUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
  >
    <FileText className="w-4 h-4" />
    View signed contract
  </a>
)}
```

Same link appears on the staff acknowledge section ("Download your contract").

### Task 2.5: Verify PATCH accepts fields

- [ ] **Step 7: Verify `PATCH /api/contracts/[id]` route already accepts `documentUrl` + `documentId` in its Zod schema.** If not, add them (they're optional + nullable).

- [ ] **Step 8: Run full test suite + tsc + build.**

```bash
npm test -- --run
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run build
```

Expected: all pass, 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/contracts/ContractFormFields.tsx \
  src/components/contracts/ContractDetailPanel.tsx \
  src/app/api/contracts/\[id\]/route.ts \
  src/__tests__/components/contract-upload.test.tsx
git commit -m "feat(contracts): upload + download signed contract PDF"
```

---

## Chunk 3: Commit 3 — contract acknowledge triggers onboarding seed

**Goal:** When staff ack their contract, auto-create a `StaffOnboarding` assignment with the matching `OnboardingPack`. Config-driven mapping so it's easy to edit. No-service users log a warning instead of failing.

### File structure

```
src/lib/contracts/onboarding-mapping.ts                        (NEW — config map + resolver)
src/app/api/contracts/[id]/acknowledge/route.ts                (MODIFY — seed on ack)
src/__tests__/api/contracts-acknowledge-onboarding.test.ts     (NEW — route test matrix)
```

### Task 3.1: Create mapping module

**Files:**
- Create: `src/lib/contracts/onboarding-mapping.ts`

- [ ] **Step 1: Create mapping + resolver.**

**Existing seeded pack names (from `src/app/api/onboarding/seed/route.ts` — verified during planning):**
- `"New Educator Induction"` — default (isDefault: true)
- `"Centre Coordinator Induction"`
- `"Casual / Relief Educator Induction"`
- `"Administration / Office Staff Induction"`
- `"Volunteer / Student Placement Induction"`
- `"Annual Staff Compliance Renewal"`

```ts
// src/lib/contracts/onboarding-mapping.ts
import type { ContractType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Map contract type → OnboardingPack name.
 * Names match the canonical seed in src/app/api/onboarding/seed/route.ts.
 * Edit here when adding new pack types.
 */
export const CONTRACT_TYPE_TO_PACK_NAME: Record<ContractType, string> = {
  ct_casual: "Casual / Relief Educator Induction",
  ct_part_time: "New Educator Induction",
  ct_permanent: "New Educator Induction",
  ct_fixed_term: "New Educator Induction",
};

/**
 * Resolve the OnboardingPack to use for a given contract.
 * Lookup order:
 *   1. Pack matching CONTRACT_TYPE_TO_PACK_NAME[contractType]
 *   2. Default pack for the user's service (serviceId matches + isDefault=true)
 *   3. Global default pack (serviceId=null + isDefault=true) — the "New Educator Induction" seed is isDefault:true with serviceId:null
 *   4. null → caller logs warn + notifies admin
 */
export async function resolveOnboardingPackForContract(params: {
  contractType: ContractType;
  userServiceId: string | null;
}): Promise<{ id: string; name: string } | null> {
  const targetName = CONTRACT_TYPE_TO_PACK_NAME[params.contractType];

  if (targetName) {
    const byName = await prisma.onboardingPack.findFirst({
      where: { name: targetName, deleted: false },
      select: { id: true, name: true },
    });
    if (byName) return byName;
  }

  // Service-default fallback
  if (params.userServiceId) {
    const serviceDefault = await prisma.onboardingPack.findFirst({
      where: { serviceId: params.userServiceId, isDefault: true, deleted: false },
      select: { id: true, name: true },
    });
    if (serviceDefault) return serviceDefault;
  }

  // Global default (the seeded "New Educator Induction" pack is isDefault=true, serviceId=null)
  const globalDefault = await prisma.onboardingPack.findFirst({
    where: { serviceId: null, isDefault: true, deleted: false },
    select: { id: true, name: true },
  });
  if (globalDefault) return globalDefault;

  return null;
}
```

**Verified:** `OnboardingPack` model has `deleted Boolean @default(false)` at prisma schema line 2197.

**Assumption:** Packs have been seeded via `POST /api/onboarding/seed` (idempotent route — run once per environment). If they aren't yet, the resolver returns null and the acknowledge logs a warn. No hard failure. Document this in the PR body so the user knows to hit that endpoint once on Neon if it hasn't been run.

### Task 3.2: Write failing test — acknowledge seeds onboarding

**Files:**
- Create: `src/__tests__/api/contracts-acknowledge-onboarding.test.ts`

- [ ] **Step 2: Write tests covering all 4 scenarios.**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { POST } from "@/app/api/contracts/[id]/acknowledge/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("POST /api/contracts/[id]/acknowledge — onboarding seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true, serviceId: "s-1" });
  });

  it("seeds StaffOnboarding on first ack", async () => {
    mockSession({ id: "u-1", role: "staff" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "c-1", userId: "u-1", contractType: "ct_permanent", acknowledgedByStaff: false,
    });
    prismaMock.employmentContract.update.mockResolvedValue({ id: "c-1" });
    prismaMock.onboardingPack.findFirst.mockResolvedValueOnce({ id: "p-1", name: "Standard Onboarding" });
    prismaMock.staffOnboarding.findUnique.mockResolvedValueOnce(null);
    prismaMock.staffOnboarding.create.mockResolvedValueOnce({ id: "o-1" });

    const req = createRequest("POST", "/api/contracts/c-1/acknowledge");
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    expect(prismaMock.staffOnboarding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u-1", packId: "p-1" }),
      })
    );
  });

  it("does not duplicate StaffOnboarding when pack already assigned", async () => {
    mockSession({ id: "u-1", role: "staff" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "c-1", userId: "u-1", contractType: "ct_permanent", acknowledgedByStaff: false,
    });
    prismaMock.employmentContract.update.mockResolvedValue({ id: "c-1" });
    prismaMock.onboardingPack.findFirst.mockResolvedValueOnce({ id: "p-1", name: "Standard Onboarding" });
    prismaMock.staffOnboarding.findUnique.mockResolvedValueOnce({ id: "o-existing", packId: "p-1", userId: "u-1" });

    const req = createRequest("POST", "/api/contracts/c-1/acknowledge");
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    expect(prismaMock.staffOnboarding.create).not.toHaveBeenCalled();
  });

  it("falls back to service default pack when no type-specific pack exists", async () => {
    mockSession({ id: "u-1", role: "staff" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "c-1", userId: "u-1", contractType: "ct_casual", acknowledgedByStaff: false,
    });
    prismaMock.employmentContract.update.mockResolvedValue({ id: "c-1" });
    // First lookup (by name) returns null; second (service default) returns the fallback
    prismaMock.onboardingPack.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "p-default", name: "Service Default" });
    prismaMock.staffOnboarding.findUnique.mockResolvedValueOnce(null);
    prismaMock.staffOnboarding.create.mockResolvedValueOnce({ id: "o-1" });

    const req = createRequest("POST", "/api/contracts/c-1/acknowledge");
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    expect(prismaMock.staffOnboarding.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ packId: "p-default" }) })
    );
  });

  it("returns 200 and logs warn when no pack resolvable (head-office, no service)", async () => {
    mockSession({ id: "u-head", role: "head_office" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true, serviceId: null });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "c-head", userId: "u-head", contractType: "ct_permanent", acknowledgedByStaff: false,
    });
    prismaMock.employmentContract.update.mockResolvedValue({ id: "c-head" });
    prismaMock.onboardingPack.findFirst
      .mockResolvedValueOnce(null) // by name
      .mockResolvedValueOnce(null); // global default (service is null so skip)

    const req = createRequest("POST", "/api/contracts/c-head/acknowledge");
    const res = await POST(req, { params: Promise.resolve({ id: "c-head" }) });
    expect(res.status).toBe(200); // does NOT fail the ack
    expect(prismaMock.staffOnboarding.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL.**

### Task 3.3: Wire seed into acknowledge route

**Files:**
- Modify: `src/app/api/contracts/[id]/acknowledge/route.ts`

- [ ] **Step 4: After the existing ack `prisma.employmentContract.update`, add seeding logic.**

```ts
// ... inside POST handler, after the existing `update` call ...

// Contract acknowledged — seed onboarding pack if none exists for this (user, pack).
try {
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { serviceId: true },
  });
  const pack = await resolveOnboardingPackForContract({
    contractType: contract.contractType,
    userServiceId: user?.serviceId ?? null,
  });
  if (!pack) {
    logger.warn("No OnboardingPack resolvable for contract ack", {
      userId: session!.user.id,
      contractId: id,
      contractType: contract.contractType,
    });
    // Best-effort: notify admin via existing notification pattern. Non-fatal.
  } else {
    const existing = await prisma.staffOnboarding.findUnique({
      where: { userId_packId: { userId: session!.user.id, packId: pack.id } },
    });
    if (!existing) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);
      await prisma.staffOnboarding.create({
        data: {
          userId: session!.user.id,
          packId: pack.id,
          status: "not_started",
          dueDate,
        },
      });
    }
  }
} catch (err) {
  // Don't fail the ack if seeding errors — log and move on.
  logger.error("Failed to seed onboarding after contract ack (non-fatal)", {
    userId: session!.user.id,
    contractId: id,
    err,
  });
}

return NextResponse.json(updated);
```

- [ ] **Step 5: Run tests — expect PASS.**

- [ ] **Step 6: Full suite + tsc + build.**

- [ ] **Step 7: Commit**

```bash
git add src/lib/contracts/onboarding-mapping.ts \
  src/app/api/contracts/\[id\]/acknowledge/route.ts \
  src/__tests__/api/contracts-acknowledge-onboarding.test.ts
git commit -m "feat(contracts): acknowledge-triggers-onboarding-seed wire-up"
```

---

## Chunk 4: Commits 4 + 5 — Staff Contracts tab + Nav exposure

### Commit 4 — Contracts tab on `/staff/[id]`

**Goal:** Admins can see a staffer's contract history directly on their profile page. Uses the same `ContractDetailPanel` extracted in Commit 1.

### File structure (Commit 4)

```
src/components/staff/StaffProfileTabs.tsx           (MODIFY — add "contracts" key + tab entry + render)
src/components/staff/tabs/ContractsTab.tsx          (NEW — ~120 lines; lists contracts for the staffer)
src/app/(dashboard)/staff/[id]/page.tsx             (MODIFY — add "contracts" to VALID_TABS; pass contracts to the tabs component)
```

- [ ] **Step 1 — Write the tab test (TDD):**

Create: `src/__tests__/components/staff-contracts-tab.test.tsx`

Renders the new `ContractsTab` component with mocked hooks and asserts:
1. Shows list of contracts ordered newest-first
2. Status badges render (Active, Superseded, etc.)
3. "New contract" button visible when `canEdit={true}`
4. Clicking a row fires `onSelectContract(contractId)`

- [ ] **Step 2: Run — FAIL (component doesn't exist).**

- [ ] **Step 3: Implement `ContractsTab.tsx`** using `useContracts({ userId })`. Reuse `ContractsTable` if possible — pass a `compact` prop to hide certain columns. If reuse proves awkward, inline a minimal list.

- [ ] **Step 4: Add `"contracts"` to `StaffProfileTabKey` union + `VALID_TABS` set in `src/app/(dashboard)/staff/[id]/page.tsx`.**

- [ ] **Step 5: In `StaffProfileTabs.tsx`, add the new tab entry, gated by role (only admin / head_office / owner see it).** The existing `isAdminRole(viewerRole)` helper is the gate.

- [ ] **Step 6: Pass `ContractsTab` rendering inside the tab panel.** Follow the pattern used by `EmploymentTab`, `LeaveTab`, etc.

- [ ] **Step 7: Run test — PASS.**

- [ ] **Step 8: Run suite + tsc + build.**

- [ ] **Step 9: Commit**

```bash
git add src/components/staff/StaffProfileTabs.tsx \
  src/components/staff/tabs/ContractsTab.tsx \
  src/app/\(dashboard\)/staff/\[id\]/page.tsx \
  src/__tests__/components/staff-contracts-tab.test.tsx
git commit -m "feat(staff-profile): Contracts tab on /staff/[id] showing history"
```

---

### Commit 5 — Nav exposure + pre-step audit

**Goal:** `/contracts` is already in nav-config.ts (per "Surprises noted"); add the `hasFeature("contracts.view")` filter in the Sidebar so users without the feature don't see it in their sidebar.

### Pre-step: Audit `contracts.view` role list

- [ ] **Step 1: Re-read `src/lib/role-permissions.ts`.** Confirm:
  - `contracts.view` present in: owner (via `ownerFeatures`), head_office (via filter), admin (via filter), member (line 533), staff (line 580)
  - `contracts.view` NOT present in marketing (`marketingFeatures` does not list it)

If marketing is in the list, narrow it in this commit (remove marketing; it's a bug).

- [ ] **Step 2: Verify `/contracts` in `rolePageAccess`:**
  - owner / head_office / admin get `/contracts` via `allPages`
  - marketing's list does NOT include `/contracts` (confirmed)
  - coordinator: check if in their list — member / staff inherit appropriately

### Task 5.1: Gate nav visibility by feature

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (or wherever nav items are filtered)
- Modify: `src/lib/nav-config.ts` (add an optional `feature?: Feature` field)

- [ ] **Step 3: Add `feature` property to `NavItem` type in `nav-config.ts`.**

```ts
// src/lib/nav-config.ts
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  section: string;
  tooltip?: string;
  feature?: Feature;  // NEW — if set, item only visible when hasFeature(role, feature)
}
```

- [ ] **Step 4: Tag the contracts item:**

```ts
{ href: "/contracts", label: "Contracts", icon: FileSignature, section: "People", tooltip: "Employment contracts & award rates", feature: "contracts.view" },
```

- [ ] **Step 5: Update Sidebar filter** (line 44 area where it filters by `canAccessPage`) to also check the feature:

```tsx
navItems.filter((item) => {
  const role = session?.user?.role as Role | undefined;
  if (!canAccessPage(role, item.href)) return false;
  if (item.feature && !hasFeature(role, item.feature)) return false;
  return true;
});
```

### Task 5.2: Write test for feature gate

- [ ] **Step 6: Unit test the filter helper.** Since the filter is inline in Sidebar, extract into a pure helper `filterNavItems(items, role)` in `src/lib/nav-config.ts` so tests can cover it:

```ts
export function filterNavItems(items: NavItem[], role: Role | undefined): NavItem[] {
  return items.filter((item) => {
    if (!canAccessPage(role, item.href)) return false;
    if (item.feature && !hasFeature(role, item.feature)) return false;
    return true;
  });
}
```

Create: `src/__tests__/lib/nav-config.test.ts`

Tests:
- Contracts nav item visible for owner
- Contracts nav item visible for staff (has contracts.view)
- Contracts nav item hidden for marketing (no contracts.view)

- [ ] **Step 7: Run — FAIL initially, PASS after wiring.**

- [ ] **Step 8: Suite + tsc + build.**

- [ ] **Step 9: Commit**

```bash
git add src/lib/nav-config.ts \
  src/components/layout/Sidebar.tsx \
  src/__tests__/lib/nav-config.test.ts
git commit -m "feat(nav): expose /contracts in sidebar under People (role-gated)"
```

---

## Chunk 5: Commits 6 + 7 — AI screening + CandidateDetailPanel

### Commit 6 — AI candidate screening

**Goal:** Admin clicks "AI Screen" on a candidate → LLM generates a 0-100 fit score + summary → persists to `aiScreenScore` + `aiScreenSummary` → surfaces as a badge + expandable summary.

### File structure

```
src/lib/ai.ts                                                   (MODIFY — add `generateText(prompt, opts)` wrapper at module boundary for test-mockable entry)
src/lib/recruitment/ai-screen-prompt.ts                         (NEW — prompt template + variable interpolation)
src/app/api/recruitment/candidates/[id]/ai-screen/route.ts      (NEW — POST, rate-limited 5/min)
src/hooks/useRecruitment.ts                                     (NEW — useVacancies, useVacancy, useCandidates, useUpdateCandidate, useAiScreenCandidate hooks)
src/components/recruitment/VacancyDetailPanel.tsx               (MODIFY — wire "AI Screen" button into candidate rows)
src/__tests__/api/recruitment-ai-screen.test.ts                 (NEW — route tests)
src/__tests__/lib/ai-screen-prompt.test.ts                      (NEW — prompt-builder tests)
```

### Task 6.1: Add `generateText` to `src/lib/ai.ts`

- [ ] **Step 1: Add thin wrapper at module boundary.**

```ts
// src/lib/ai.ts
import Anthropic from "@anthropic-ai/sdk";

let _anthropic: Anthropic | null = null;

export function getAI(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

export interface GenerateTextOptions {
  model?: string;         // default: "claude-sonnet-4-6"
  maxTokens?: number;     // default: 1000
  system?: string;
  temperature?: number;
}

/**
 * Non-streaming LLM call. Use this as the test seam for server-side AI calls:
 * `vi.mock("@/lib/ai", () => ({ generateText: vi.fn(() => "mock") }))`.
 */
export async function generateText(prompt: string, opts: GenerateTextOptions = {}): Promise<string> {
  const ai = getAI();
  if (!ai) {
    throw new Error("AI is not configured. Set ANTHROPIC_API_KEY environment variable.");
  }
  const res = await ai.messages.create({
    model: opts.model ?? "claude-sonnet-4-6",
    max_tokens: opts.maxTokens ?? 1000,
    system: opts.system,
    temperature: opts.temperature,
    messages: [{ role: "user", content: prompt }],
  });
  const block = res.content[0];
  if (block?.type !== "text") return "";
  return block.text;
}
```

- [ ] **Step 2: Tsc + build pass.**

### Task 6.2: Build prompt template module

- [ ] **Step 3: Create `src/lib/recruitment/ai-screen-prompt.ts`.**

```ts
export interface AiScreenInputs {
  candidateName: string;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  resumeText: string;
  vacancyRole: string;
  employmentType: string;
  qualificationRequired?: string | null;
}

export interface AiScreenResult {
  score: number;    // 0-100
  summary: string;  // 2-4 sentences
}

export function buildScreenPrompt(inputs: AiScreenInputs): string {
  return `You are an HR screening assistant for Amana OSHC (Out of School Hours Care in Australia). Assess candidate fit for an OSHC educator vacancy.

VACANCY:
- Role: ${inputs.vacancyRole}
- Employment Type: ${inputs.employmentType}
- Qualification Required: ${inputs.qualificationRequired ?? "None specified"}

CANDIDATE:
- Name: ${inputs.candidateName}
- Email: ${inputs.candidateEmail ?? "(not provided)"}
- Phone: ${inputs.candidatePhone ?? "(not provided)"}

RESUME / APPLICATION DETAILS:
"""
${inputs.resumeText.trim() || "(no resume text provided)"}
"""

Respond in exactly this JSON shape:
{"score": <integer 0-100>, "summary": "<2-4 sentence summary covering: relevant childcare/education experience, qualifications, strengths, gaps>"}

Do not include any text outside the JSON object.`;
}

export function parseScreenResponse(raw: string): AiScreenResult {
  // Strip common code fences the model sometimes adds.
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(cleaned) as { score: unknown; summary: unknown };
  const score = Number(parsed.score);
  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error("AI returned invalid score");
  }
  if (!summary.trim()) {
    throw new Error("AI returned empty summary");
  }
  return { score: Math.round(score), summary: summary.trim() };
}
```

- [ ] **Step 4: Write prompt tests.** Create `src/__tests__/lib/ai-screen-prompt.test.ts` covering:
  - `buildScreenPrompt` interpolates all vars correctly
  - `parseScreenResponse` handles raw JSON
  - `parseScreenResponse` handles JSON wrapped in ```json fences
  - `parseScreenResponse` throws on score > 100, < 0, non-numeric
  - `parseScreenResponse` throws on empty summary

- [ ] **Step 5: Run — PASS.**

### Task 6.3: Implement AI screen route

**Files:**
- Create: `src/app/api/recruitment/candidates/[id]/ai-screen/route.ts`

- [ ] **Step 6: Write failing test.** Create `src/__tests__/api/recruitment-ai-screen.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 4, resetIn: 60000 })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/ai", () => ({
  generateText: vi.fn(async () => JSON.stringify({ score: 78, summary: "Strong early-childhood experience with 3+ years at a previous OSHC service. Diploma in Early Childhood Education. No gaps flagged." })),
  getAI: vi.fn(() => ({})),
}));

import { POST } from "@/app/api/recruitment/candidates/[id]/ai-screen/route";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateText } from "@/lib/ai";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("POST /api/recruitment/candidates/[id]/ai-screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/recruitment/candidates/c-1/ai-screen");
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(401);
  });

  it("403 when role is not admin/head_office/owner", async () => {
    mockSession({ id: "u-1", role: "member" });
    const req = createRequest("POST", "/api/recruitment/candidates/c-1/ai-screen");
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(403);
  });

  it("404 when candidate not found", async () => {
    mockSession({ id: "u-1", role: "admin" });
    prismaMock.recruitmentCandidate.findUnique.mockResolvedValue(null);
    const req = createRequest("POST", "/api/recruitment/candidates/c-missing/ai-screen");
    const res = await POST(req, { params: Promise.resolve({ id: "c-missing" }) });
    expect(res.status).toBe(404);
  });

  it("200 persists score + summary", async () => {
    mockSession({ id: "u-1", role: "admin" });
    prismaMock.recruitmentCandidate.findUnique.mockResolvedValue({
      id: "c-1",
      name: "Amira Candidate",
      email: "amira@test.com",
      phone: null,
      resumeText: "3 years OSHC, Cert III",
      vacancy: { role: "educator", employmentType: "part_time", qualificationRequired: "cert_iii" },
    });
    prismaMock.recruitmentCandidate.update.mockResolvedValue({ id: "c-1", aiScreenScore: 78, aiScreenSummary: "Strong..." });

    const req = createRequest("POST", "/api/recruitment/candidates/c-1/ai-screen");
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aiScreenScore).toBe(78);
    expect(body.aiScreenSummary).toContain("Strong");
    expect(prismaMock.recruitmentCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-1" }, data: expect.objectContaining({ aiScreenScore: 78 }) })
    );
  });

  it("returns 400 when candidate has no resumeText", async () => {
    mockSession({ id: "u-1", role: "admin" });
    prismaMock.recruitmentCandidate.findUnique.mockResolvedValue({
      id: "c-1", name: "X", email: null, phone: null, resumeText: null,
      vacancy: { role: "educator", employmentType: "permanent", qualificationRequired: null },
    });
    const req = createRequest("POST", "/api/recruitment/candidates/c-1/ai-screen");
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(400);
  });

  it("429 when rate-limit exceeded on rapid-fire consecutive requests (5/min cap)", async () => {
    mockSession({ id: "u-1", role: "admin" });
    prismaMock.recruitmentCandidate.findUnique.mockResolvedValue({
      id: "c-1", name: "X", email: null, phone: null, resumeText: "ok",
      vacancy: { role: "educator", employmentType: "permanent", qualificationRequired: null },
    });
    // Simulate the in-memory limiter: 5 requests pass, 6th hits the cap.
    const limited = vi.mocked(checkRateLimit);
    limited
      .mockResolvedValueOnce({ limited: false, remaining: 4, resetIn: 60000 })
      .mockResolvedValueOnce({ limited: false, remaining: 3, resetIn: 60000 })
      .mockResolvedValueOnce({ limited: false, remaining: 2, resetIn: 60000 })
      .mockResolvedValueOnce({ limited: false, remaining: 1, resetIn: 60000 })
      .mockResolvedValueOnce({ limited: false, remaining: 0, resetIn: 60000 })
      .mockResolvedValueOnce({ limited: true,  remaining: 0, resetIn: 60000 });

    let last: Response | null = null;
    for (let i = 0; i < 6; i++) {
      const req = createRequest("POST", "/api/recruitment/candidates/c-1/ai-screen");
      last = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    }
    expect(last?.status).toBe(429);
  });
});
```

- [ ] **Step 7: Run — FAIL (route doesn't exist).**

- [ ] **Step 8: Implement route.**

```ts
// src/app/api/recruitment/candidates/[id]/ai-screen/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { generateText } from "@/lib/ai";
import { buildScreenPrompt, parseScreenResponse } from "@/lib/recruitment/ai-screen-prompt";

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    const candidate = await prisma.recruitmentCandidate.findUnique({
      where: { id },
      include: {
        vacancy: { select: { role: true, employmentType: true, qualificationRequired: true } },
      },
    });
    if (!candidate) {
      throw ApiError.notFound("Candidate not found");
    }
    if (!candidate.resumeText || candidate.resumeText.trim().length === 0) {
      throw ApiError.badRequest("Candidate has no resume text to screen");
    }

    const prompt = buildScreenPrompt({
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      candidatePhone: candidate.phone,
      resumeText: candidate.resumeText,
      vacancyRole: candidate.vacancy.role,
      employmentType: candidate.vacancy.employmentType,
      qualificationRequired: candidate.vacancy.qualificationRequired,
    });

    let result;
    try {
      const raw = await generateText(prompt, {
        model: "claude-sonnet-4-6",
        maxTokens: 800,
        temperature: 0.2,
      });
      result = parseScreenResponse(raw);
    } catch (err) {
      logger.error("AI screen failed", { candidateId: id, err });
      throw ApiError.badRequest(
        err instanceof Error ? `AI screening failed: ${err.message}` : "AI screening failed"
      );
    }

    const updated = await prisma.recruitmentCandidate.update({
      where: { id },
      data: {
        aiScreenScore: result.score,
        aiScreenSummary: result.summary,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "ai_screen",
        entityType: "RecruitmentCandidate",
        entityId: id,
        details: { score: result.score },
      },
    });

    return NextResponse.json({ aiScreenScore: updated.aiScreenScore, aiScreenSummary: updated.aiScreenSummary });
  },
  { roles: ["owner", "head_office", "admin"], rateLimit: { max: 5, windowMs: 60_000 } }
);
```

- [ ] **Step 9: Run tests — PASS.**

### Task 6.4: Client hook `useAiScreenCandidate` + UI

- [ ] **Step 10: Create `src/hooks/useRecruitment.ts`** with all recruitment-related hooks:

```ts
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface Vacancy { id: string; serviceId: string; role: string; status: string; /* ... */ }
export interface Candidate { id: string; vacancyId: string; name: string; stage: string; aiScreenScore: number | null; aiScreenSummary: string | null; /* ... */ }

export function useVacancies(filters?: { serviceId?: string; status?: string; q?: string }) {
  const params = new URLSearchParams();
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.q) params.set("q", filters.q);
  const query = params.toString();
  return useQuery({
    queryKey: ["vacancies", filters?.serviceId, filters?.status, filters?.q],
    queryFn: () => fetchApi<{ vacancies: Vacancy[]; total: number }>(`/api/recruitment${query ? `?${query}` : ""}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useVacancy(id: string | null) {
  return useQuery({
    queryKey: ["vacancy", id],
    queryFn: () => fetchApi<Vacancy & { candidates: Candidate[] }>(`/api/recruitment/${id}`),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useUpdateCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; stage?: string; notes?: string; interviewNotes?: string; /* ... */ }) =>
      mutateApi(`/api/recruitment/candidates/${id}`, { method: "PATCH", body: data }),
    onMutate: async (vars) => {
      // Optimistic: update the cached vacancy.candidates list
      await qc.cancelQueries({ queryKey: ["vacancy"] });
      const snapshot = qc.getQueriesData({ queryKey: ["vacancy"] });
      qc.setQueriesData<{ candidates?: Candidate[] }>({ queryKey: ["vacancy"] }, (old) => {
        if (!old?.candidates) return old;
        return {
          ...old,
          candidates: old.candidates.map((c) =>
            c.id === vars.id ? { ...c, ...vars, stageChangedAt: new Date().toISOString() } : c
          ),
        };
      });
      return { snapshot };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.snapshot) {
        ctx.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      }
      toast({ variant: "destructive", description: err.message || "Failed to update candidate" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["vacancy"] }),
  });
}

export function useAiScreenCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (candidateId: string) =>
      mutateApi<{ aiScreenScore: number; aiScreenSummary: string }>(`/api/recruitment/candidates/${candidateId}/ai-screen`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vacancy"] });
      qc.invalidateQueries({ queryKey: ["vacancies"] });
      toast({ description: "AI screening complete" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "AI screening failed" });
    },
  });
}
```

- [ ] **Step 11: Wire AI Screen button in `VacancyDetailPanel.tsx`.** Each candidate row gets:
  - A small "AI Screen" button (or "Re-screen" if `aiScreenScore != null`)
  - A score badge (color-coded: green 80+, amber 50-79, red < 50) next to their name when set
  - A click-to-expand summary panel below the row

Small addition — no full rewrite of VacancyDetailPanel in this commit. Full rewrite (CandidateDetailPanel component) is Commit 7.

- [ ] **Step 12: Run all tests + tsc + build.**

- [ ] **Step 13: Commit**

```bash
git add src/lib/ai.ts \
  src/lib/recruitment/ai-screen-prompt.ts \
  src/app/api/recruitment/candidates/\[id\]/ai-screen/route.ts \
  src/hooks/useRecruitment.ts \
  src/components/recruitment/VacancyDetailPanel.tsx \
  src/__tests__/api/recruitment-ai-screen.test.ts \
  src/__tests__/lib/ai-screen-prompt.test.ts
git commit -m "feat(recruitment): AI candidate screening on vacancy detail"
```

---

### Commit 7 — CandidateDetailPanel with inline stage + notes (optimistic)

**Goal:** Replace the inline candidate-row UI in `VacancyDetailPanel` with a proper detail panel. Opens on candidate click. Owns stage dropdown + notes + AI summary + activity log.

### File structure

```
src/components/recruitment/CandidateDetailPanel.tsx     (NEW — ~280 lines)
src/components/recruitment/VacancyDetailPanel.tsx       (MODIFY — click row → open CandidateDetailPanel; remove inline stage UI)
src/components/recruitment/AiScreenBadge.tsx            (NEW — small reusable score badge + expandable summary)
src/__tests__/components/candidate-detail.test.tsx      (NEW — optimistic + revert)
```

### Task 7.1: Test — optimistic stage update + revert on error

- [ ] **Step 1: Write failing test.**

```tsx
// src/__tests__/components/candidate-detail.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CandidateDetailPanel } from "@/components/recruitment/CandidateDetailPanel";

const mockToast = vi.fn();
vi.mock("@/hooks/useToast", () => ({ toast: (...args: unknown[]) => mockToast(...args) }));

vi.mock("@/lib/fetch-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fetch-api")>("@/lib/fetch-api");
  return { ...actual, mutateApi: vi.fn(async () => { throw new Error("Network down"); }) };
});

describe("CandidateDetailPanel — optimistic stage update", () => {
  it("reverts stage on error and surfaces a destructive toast", async () => {
    mockToast.mockClear();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const candidate = { id: "c-1", stage: "applied", name: "X", email: null, phone: null, notes: null, interviewNotes: null, aiScreenScore: null, aiScreenSummary: null, vacancyId: "v-1", stageChangedAt: new Date().toISOString() };
    qc.setQueryData(["vacancy", "v-1"], { id: "v-1", candidates: [candidate] });

    render(
      <QueryClientProvider client={qc}>
        <CandidateDetailPanel candidateId="c-1" vacancyId="v-1" onClose={() => {}} />
      </QueryClientProvider>
    );

    const select = screen.getByLabelText(/stage/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "screened" } });

    // Optimistic update — immediately shows "screened"
    expect(select.value).toBe("screened");

    // Wait for error → revert
    await waitFor(() => expect(select.value).toBe("applied"));

    // Destructive toast surfaced with error message
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", description: expect.stringContaining("Network down") })
      )
    );
  });
});
```

- [ ] **Step 2: Run — FAIL.**

### Task 7.2: Implement `CandidateDetailPanel.tsx`

Uses `useUpdateCandidate()` from Commit 6's hook (same `onMutate` revert pattern).

Structure (abbreviated — full file is ~280 lines):

```tsx
"use client";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateCandidate, useAiScreenCandidate, type Candidate } from "@/hooks/useRecruitment";
import { AiScreenBadge } from "./AiScreenBadge";
import { Sparkles, X } from "lucide-react";
import { toast } from "@/hooks/useToast";

interface Props {
  candidateId: string | null;
  vacancyId: string;
  onClose: () => void;
}

const STAGES = ["applied", "screened", "interviewed", "offered", "accepted", "rejected", "withdrawn"] as const;

export function CandidateDetailPanel({ candidateId, vacancyId, onClose }: Props) {
  const qc = useQueryClient();
  const cached = qc.getQueryData<{ candidates: Candidate[] }>(["vacancy", vacancyId]);
  const candidate = cached?.candidates?.find((c) => c.id === candidateId);

  const updateMutation = useUpdateCandidate();
  const aiScreenMutation = useAiScreenCandidate();

  // Local debounced-save state for notes
  const [notesDraft, setNotesDraft] = useState(candidate?.notes ?? "");
  useEffect(() => { setNotesDraft(candidate?.notes ?? ""); }, [candidate?.id]);

  useEffect(() => {
    if (!candidateId || notesDraft === (candidate?.notes ?? "")) return;
    const t = setTimeout(() => {
      updateMutation.mutate({ id: candidateId, notes: notesDraft });
    }, 2000);
    return () => clearTimeout(t);
  }, [notesDraft]);

  if (!candidateId || !candidate) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[480px] bg-card border-l border-border shadow-xl overflow-y-auto z-40">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div>
          <h3 className="text-lg font-semibold">{candidate.name}</h3>
          <p className="text-xs text-muted">{candidate.email ?? "(no email)"}</p>
        </div>
        <button onClick={onClose}><X className="w-5 h-5" /></button>
      </div>

      <div className="p-5 space-y-5">
        {/* Stage */}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor={`stage-${candidate.id}`}>Stage</label>
          <select
            id={`stage-${candidate.id}`}
            value={candidate.stage}
            onChange={(e) => updateMutation.mutate({ id: candidate.id, stage: e.target.value })}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          >
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* AI Screen */}
        <div className="border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">AI Screening</span>
            <button
              onClick={() => aiScreenMutation.mutate(candidate.id)}
              disabled={aiScreenMutation.isPending}
              className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-brand/10 text-brand hover:bg-brand/20"
            >
              <Sparkles className="w-3 h-3" />
              {candidate.aiScreenScore != null ? "Re-screen" : "AI Screen"}
            </button>
          </div>
          {candidate.aiScreenScore != null && (
            <AiScreenBadge score={candidate.aiScreenScore} summary={candidate.aiScreenSummary} />
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={5}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="Add notes… (auto-saves)"
          />
          <p className="text-xs text-muted mt-1">Auto-saves 2s after last edit.</p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => updateMutation.mutate({ id: candidate.id, stage: "offered" })}
            className="flex-1 text-sm font-medium px-3 py-2 rounded-lg bg-brand text-white hover:bg-brand/90"
          >
            Make Offer
          </button>
          <button
            onClick={() => updateMutation.mutate({ id: candidate.id, stage: "rejected" })}
            className="flex-1 text-sm font-medium px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `AiScreenBadge.tsx`** — color-coded badge + expandable summary.

```tsx
"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

function color(score: number): string {
  if (score >= 80) return "bg-emerald-100 text-emerald-700";
  if (score >= 50) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export function AiScreenBadge({ score, summary }: { score: number; summary: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full", color(score))}
      >
        AI {score}
        {summary && (open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </button>
      {open && summary && (
        <div className="mt-2 text-sm text-foreground/80 bg-surface rounded p-2">
          {summary}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire into `VacancyDetailPanel.tsx`** — clicking a candidate row opens the new panel instead of the inline UI.

- [ ] **Step 5: Run tests — PASS.**

- [ ] **Step 6: Suite + tsc + build.**

- [ ] **Step 7: Commit**

```bash
git add src/components/recruitment/CandidateDetailPanel.tsx \
  src/components/recruitment/AiScreenBadge.tsx \
  src/components/recruitment/VacancyDetailPanel.tsx \
  src/__tests__/components/candidate-detail.test.tsx
git commit -m "feat(recruitment): CandidateDetailPanel with inline stage + notes"
```

---

## Chunk 6: Commits 8–10 — Referrals + role enforcement + tests

### Commit 8 — Staff Referrals tab + Mark Bonus Paid workflow

**Goal:** `/recruitment?tab=referrals` lists all `StaffReferral` records for admins, with "Mark bonus paid" action. Also: add the `lastReminderAt` migration (the only schema change in the whole sub-project).

### File structure

```
prisma/schema.prisma                                   (MODIFY — add `lastReminderAt` to StaffReferral)
prisma/migrations/<timestamp>_add_referral_last_reminder_at/migration.sql  (AUTO-GENERATED)
migrations/manual/2026-04-22-contracts-recruitment-6.sql  (NEW — the Neon-apply artefact with the same SQL)
src/app/api/staff-referrals/route.ts                   (NEW — GET list, POST create)
src/app/api/staff-referrals/[id]/route.ts              (NEW — PATCH status; POST pay)
src/hooks/useRecruitment.ts                            (MODIFY — add useReferrals, useMarkReferralPaid)
src/app/(dashboard)/recruitment/page.tsx               (MODIFY — add tab switcher with `?tab=vacancies|referrals`)
src/components/recruitment/ReferralsTable.tsx          (NEW — ~150 lines)
src/components/recruitment/MarkReferralPaidModal.tsx   (NEW — ~90 lines — payout date + optional xero link)
src/__tests__/api/staff-referrals.test.ts              (NEW — full route matrix)
```

### Task 8.1: Schema + migration artefact

- [ ] **Step 1: Edit `prisma/schema.prisma`.** In `model StaffReferral` (lines 3787–3803), add:

```prisma
  lastReminderAt DateTime?
```

- [ ] **Step 2: Generate migration.** Run:

```bash
npx prisma migrate dev --create-only --name add_referral_last_reminder_at
```

This creates `prisma/migrations/<timestamp>_add_referral_last_reminder_at/migration.sql` without applying it.

- [ ] **Step 3: Create Neon-apply artefact.**

```bash
mkdir -p migrations/manual
cat > migrations/manual/2026-04-22-contracts-recruitment-6.sql <<'EOF'
-- Sub-project 6: Contracts + Recruitment Rebuild
-- Apply against Neon before merging PR.
-- Single additive field: StaffReferral.lastReminderAt

ALTER TABLE "StaffReferral" ADD COLUMN "lastReminderAt" TIMESTAMP(3);
EOF
```

The Prisma migration folder stays in git as the source of truth; the `migrations/manual/*.sql` is a convenience mirror for the user to copy-paste into Neon SQL Editor.

### Task 8.2: API routes

- [ ] **Step 4: Write failing tests first.** `src/__tests__/api/staff-referrals.test.ts` covers:
  - GET list: 401 / 403 (non-admin) / 200 with list
  - POST create: 400 invalid / 201 success
  - PATCH mark paid: 401 / 403 / 404 / 200 (sets status + bonusPaidAt)
  - PATCH validates status transitions (pending → bonus_paid only; not expired → bonus_paid)

- [ ] **Step 5: Implement `src/app/api/staff-referrals/route.ts`.**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

export const GET = withApiAuth(async (req, _session) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const referrals = await prisma.staffReferral.findMany({
    where,
    include: {
      referrerUser: { select: { id: true, name: true, email: true, avatar: true } },
      candidate: { select: { id: true, name: true, email: true, stage: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(referrals);
}, { roles: ["owner", "head_office", "admin"] });

const createSchema = z.object({
  referrerUserId: z.string().min(1),
  referredName: z.string().min(1),
  referredEmail: z.string().email().optional().nullable(),
  candidateId: z.string().optional().nullable(),
  bonusAmount: z.number().min(0).optional(),
});

export const POST = withApiAuth(async (req, _session) => {
  const body = await parseJsonBody(req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }
  const referral = await prisma.staffReferral.create({ data: { ...parsed.data } });
  return NextResponse.json(referral, { status: 201 });
}, { roles: ["owner", "head_office", "admin"] });
```

- [ ] **Step 6: Implement `src/app/api/staff-referrals/[id]/route.ts`.**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const patchSchema = z.object({
  status: z.enum(["pending", "hired", "bonus_paid", "expired"]).optional(),
  bonusAmount: z.number().min(0).optional(),
  bonusPaidAt: z.string().datetime().nullable().optional(),
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);

  const existing = await prisma.staffReferral.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Referral not found");

  // Only allow pending/hired → bonus_paid (not expired → bonus_paid)
  if (parsed.data.status === "bonus_paid" && existing.status !== "pending" && existing.status !== "hired") {
    throw ApiError.badRequest(`Cannot mark as paid from status '${existing.status}'`);
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.bonusAmount !== undefined) data.bonusAmount = parsed.data.bonusAmount;
  if (parsed.data.status === "bonus_paid") {
    data.bonusPaidAt = parsed.data.bonusPaidAt ? new Date(parsed.data.bonusPaidAt) : new Date();
  }

  const updated = await prisma.staffReferral.update({ where: { id }, data });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: parsed.data.status === "bonus_paid" ? "pay_bonus" : "update",
      entityType: "StaffReferral",
      entityId: id,
      details: { status: updated.status, bonusAmount: updated.bonusAmount },
    },
  });

  return NextResponse.json(updated);
}, { roles: ["owner", "head_office", "admin"] });
```

- [ ] **Step 7: Run tests — PASS.**

### Task 8.3: Hooks + UI

- [ ] **Step 8: Add `useReferrals` + `useMarkReferralPaid` to `useRecruitment.ts`.**

- [ ] **Step 9: `ReferralsTable.tsx` + `MarkReferralPaidModal.tsx` implementation.**

- [ ] **Step 10: Modify `recruitment/page.tsx` to add tab switcher** (`?tab=vacancies|referrals` URL-synced). Default: `vacancies`.

- [ ] **Step 11: Referrals tab hidden from non-admins — gate with `hasMinRole(role, "admin")`** OR use page-level `rolePageAccess` check (coordinators already excluded).

- [ ] **Step 12: Run tests + suite + tsc + build.**

- [ ] **Step 13: Commit**

```bash
git add prisma/schema.prisma \
  prisma/migrations/ \
  migrations/manual/2026-04-22-contracts-recruitment-6.sql \
  src/app/api/staff-referrals/ \
  src/hooks/useRecruitment.ts \
  src/app/\(dashboard\)/recruitment/page.tsx \
  src/components/recruitment/ReferralsTable.tsx \
  src/components/recruitment/MarkReferralPaidModal.tsx \
  src/__tests__/api/staff-referrals.test.ts
git commit -m "feat(recruitment): Staff Referrals tab + Mark Bonus Paid workflow"
```

**Referral-expiry cron: DEFERRED per spec.** Not shipped in this sub-project.

---

### Commit 9 — Role enforcement: wire `contracts.edit` + add recruitment features

**Goal:** Currently `contracts.edit` feature exists in `role-permissions.ts` but is never enforced in route handlers. Wire it up. Also add `recruitment.*` features to the list and enforce them.

### File structure

```
src/lib/role-permissions.ts                           (MODIFY — add recruitment.view / recruitment.edit / recruitment.candidates.manage)
src/app/api/contracts/[id]/route.ts                   (MODIFY — PATCH requires `contracts.edit`)
src/app/api/contracts/[id]/supersede/route.ts         (MODIFY — requires `contracts.edit`)
src/app/api/contracts/[id]/terminate/route.ts         (MODIFY — requires `contracts.edit`)
src/app/api/recruitment/route.ts                      (MODIFY — POST requires `recruitment.edit`)
src/app/api/recruitment/[id]/route.ts                 (MODIFY — PATCH requires `recruitment.edit`)
src/app/api/recruitment/candidates/route.ts           (MODIFY — POST requires `recruitment.candidates.manage`)
src/app/api/recruitment/candidates/[id]/route.ts      (MODIFY — PATCH requires `recruitment.candidates.manage`)
src/app/api/staff-referrals/route.ts                  (MODIFY — POST requires `recruitment.candidates.manage`)
src/app/api/staff-referrals/[id]/route.ts             (MODIFY — PATCH requires `recruitment.candidates.manage`)
src/__tests__/api/contracts.test.ts                   (MODIFY — 403 for user lacking contracts.edit)
src/__tests__/api/recruitment.test.ts                 (NEW — 403 for users lacking recruitment.edit)
```

### Task 9.1: Update role-permissions.ts

- [ ] **Step 1: Add `recruitment.*` features to the `features` tuple** (near `contracts.*`):

```ts
  // HR — Recruitment
  "recruitment.view",
  "recruitment.edit",
  "recruitment.candidates.manage",
```

- [ ] **Step 2: Add to role feature lists as appropriate.**
  - `owner` / `head_office` / `admin`: get all 3 (flow from `ownerFeatures = features`, + `headOfficeFeatures` / `adminFeatures` filters — already inherit everything they don't opt out of)
  - `coordinator`: get `recruitment.view` only (they can read vacancies + candidates in their service but not edit) — KEEPS existing read access. No write features.
  - `marketing` / `member` / `staff`: NONE (recruitment is an admin/coordinator function)

**Why coordinator gets `recruitment.view`:** We only gate GETs with `recruitment.view` if we decide to enforce at that level. In this commit we DO NOT enforce `recruitment.view` on GETs — we leave GET accessible via `roles: ["owner","head_office","admin","coordinator"]` so coordinators retain their 4a-era read access. Write features (`recruitment.edit`, `recruitment.candidates.manage`) are admin+ only and WILL be enforced.

Verify by tsc — adding to the tuple bubbles through the type.

### Task 9.2: Enforce on routes

`withApiAuth` supports either `roles` (hard role allowlist) or `feature` (feature-gated) or both. This commit uses `feature` for all WRITE operations so they're driven by role-permissions.ts centrally, and keeps `roles` on GETs where we want a simple allowlist that includes coordinator.

- [ ] **Step 3: Update each mutation route. Explicit list:**

**Contracts** (swap existing `withApiAuth(handler)` / `withApiAuth(handler, { roles: ["owner","head_office","admin"] })` → feature-gated):
- `src/app/api/contracts/route.ts` — POST: `{ feature: "contracts.create" }`; GET unchanged
- `src/app/api/contracts/[id]/route.ts` — PATCH: `{ feature: "contracts.edit" }`; GET unchanged
- `src/app/api/contracts/[id]/supersede/route.ts` — POST: `{ feature: "contracts.edit" }`
- `src/app/api/contracts/[id]/terminate/route.ts` — POST: `{ feature: "contracts.edit" }`
- `src/app/api/contracts/[id]/acknowledge/route.ts` — POST: keep default (staff acks their own); internal `if (contract.userId !== session.user.id)` gate stays

**Recruitment vacancies:**
- `src/app/api/recruitment/route.ts` — POST: `{ feature: "recruitment.edit" }`; GET: `roles: ["owner","head_office","admin","coordinator"]` (unchanged)
- `src/app/api/recruitment/[id]/route.ts` — PATCH: `{ feature: "recruitment.edit" }`; GET: same as list

**Recruitment candidates:**
- `src/app/api/recruitment/candidates/route.ts` — POST: `{ feature: "recruitment.candidates.manage" }`
- `src/app/api/recruitment/candidates/[id]/route.ts` — PATCH: `{ feature: "recruitment.candidates.manage" }`
- `src/app/api/recruitment/candidates/[id]/ai-screen/route.ts` — already has `{ roles, rateLimit }` from Commit 6; SWAP `roles: ["owner","head_office","admin"]` → `feature: "recruitment.candidates.manage"` and keep `rateLimit: { max: 5, windowMs: 60_000 }`

**Staff referrals** (just created in Commit 8 with `roles: ["owner","head_office","admin"]`):
- `src/app/api/staff-referrals/route.ts` — GET keep `roles`; POST SWAP to `{ feature: "recruitment.candidates.manage" }` (remove `roles`)
- `src/app/api/staff-referrals/[id]/route.ts` — PATCH SWAP to `{ feature: "recruitment.candidates.manage" }` (remove `roles`)

When both a `roles` array and a `feature` exist, `withApiAuth` rejects requests failing EITHER. To avoid redundancy, pick one: for WRITEs, use `feature` only (remove `roles`). The feature encodes the role allowlist centrally in `role-permissions.ts`.

- [ ] **Step 4: Update existing tests** for contracts + recruitment to assert a non-owner/admin user (e.g. member) hits 403 when trying to PATCH.

- [ ] **Step 5: Write new `src/__tests__/api/recruitment.test.ts`** covering:
  - GET list 200 for admin; 403 for member
  - POST create 201 for admin; 403 for marketing
  - PATCH 200 for admin; 403 for coordinator
  - POST candidate create 201 for admin; 403 for member
  - Rate limiting AI-screen (already covered in recruitment-ai-screen.test.ts; cross-check)

- [ ] **Step 6: Run tests + suite + tsc + build.**

- [ ] **Step 7: Commit**

```bash
git add src/lib/role-permissions.ts \
  src/app/api/contracts/ \
  src/app/api/recruitment/ \
  src/app/api/staff-referrals/ \
  src/__tests__/api/contracts.test.ts \
  src/__tests__/api/recruitment.test.ts
git commit -m "refactor(auth): wire contracts.edit + add recruitment features"
```

---

### Commit 10 — Final test sweep for both modules

**Goal:** Fill test gaps identified during commits 1-9.

### File structure (only tests)

```
src/__tests__/api/recruitment-vacancies.test.ts    (NEW or expand existing — vacancy CRUD matrix)
src/__tests__/api/recruitment-candidates.test.ts   (NEW — candidate CRUD, stage transitions)
src/__tests__/components/referrals-table.test.tsx  (NEW — empty state, status filter, mark-paid CTA)
src/__tests__/components/contracts-table.test.tsx  (NEW — filter behavior, empty state)
```

- [ ] **Step 1: Enumerate uncovered surface.** Run `npm test -- --run --coverage` (if configured) or just grep the new routes / components for paths that aren't hit by any existing test.

- [ ] **Step 2: Add gap-filling tests.** Each new test file follows the existing helper pattern (prismaMock, mockSession, createRequest).

- [ ] **Step 3: Target net-new tests ≈ 60–80 tests** across all commits combined (baseline 1617 → ~1697+).

- [ ] **Step 4: Run full suite + tsc + build.**

```bash
npm test -- --run 2>&1 | tail -3
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm run build
```

Expected: all pass, 0 errors, test count ≥ 1697.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/
git commit -m "test(contracts+recruitment): route + component coverage"
```

---

## Post-execution

- [ ] Push branch: `git push -u origin feat/contracts-recruitment-6-2026-04-22`
- [ ] Open PR with:
  - Title: `feat(contracts+recruitment): sub-project 6 — rebuild`
  - Body: before/after table (counts, file locations), migration SQL pasted inline, acceptance checklist
- [ ] Tag user to apply migration on Neon before merge
- [ ] Confirm test count delta + tsc 0 errors in PR body

## Acceptance checklist (paste into PR body)

- [ ] All 10 commits land in order on `feat/contracts-recruitment-6-2026-04-22`
- [ ] `migrations/manual/2026-04-22-contracts-recruitment-6.sql` applied to Neon (single `ALTER TABLE`)
- [ ] `src/app/(dashboard)/contracts/page.tsx` ≤ 250 lines after refactor
- [ ] Smoke test for contracts page passes (proves zero behavioural drift)
- [ ] Upload PDF → download PDF round-trip works in UI + test
- [ ] Acknowledge contract → StaffOnboarding auto-created (with no-service fallback logged)
- [ ] `/staff/[id]?tab=contracts` shows staffer's contract history (admin-only)
- [ ] `/contracts` visible in sidebar for `contracts.view`-gated roles only
- [ ] AI screen button on candidate → score + summary persist
- [ ] CandidateDetailPanel lets admin change stage + add notes inline (optimistic; reverts on error)
- [ ] `/recruitment?tab=referrals` tab + Mark Bonus Paid workflow functional
- [ ] `contracts.edit` / `recruitment.edit` / `recruitment.candidates.manage` enforced on all mutation routes
- [ ] Test count ≥ 1697 (+80 net)
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npm run build` passes
- [ ] No `console.log/warn/error` in production code; all via `logger`
- [ ] All mutations have `onError` destructive toast; all queries have `retry: 2` + `staleTime: 30_000`
- [ ] No raw `fetch()` in hooks (only in FormData upload in ContractFormFields, per convention)
- [ ] No `as any` / unsafe casts introduced

---

## Conventions (reminder — per CLAUDE.md + MEMORY.md)

- **API routes**: `withApiAuth(handler, { roles, feature, rateLimit })` or `withApiHandler` for public
- **Errors**: throw `ApiError.badRequest / notFound / forbidden / conflict` from `@/lib/api-error`; never raw `try/catch` returning `{error}`
- **JSON parsing**: `parseJsonBody(req)` not raw `req.json()`
- **Logging**: structured via `logger` from `@/lib/logger`; never `console.*` in production code
- **Client fetch**: `fetchApi<T>(url)` + `mutateApi<T>(url, { method, body })` from `@/lib/fetch-api`
- **Queries**: `retry: 2`, `staleTime: 30_000`
- **Mutations**: `onError: (err: Error) => toast({ variant: "destructive", description: err.message })`
- **Prisma JSON writes**: `Prisma.InputJsonValue` (not `as any`)
- **Role checks**: `isAdminRole` + `parseRole` from `@/lib/role-permissions`
- **Tests**: TDD first. Matrix = 401 + 400 + 403 + 404 + 200 for every mutation route.
- **New pages in nav**: update `allPages` + `rolePageAccess` + verify `canAccessPage` works (MEMORY.md critical checklist)

