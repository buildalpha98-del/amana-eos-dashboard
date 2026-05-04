# Contract Templates Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Employment-Hero–style contract template library on `/contracts` plus the issue-from-template flow that renders a PDF, stores it, emails the staff member, and creates an `EmploymentContract` row.

**Spec:** [docs/superpowers/specs/2026-05-04-contract-templates-design.md](../specs/2026-05-04-contract-templates-design.md) — read this first. The plan below is the executable counterpart; anything ambiguous in the plan is resolved by the spec.

**Architecture:** New `ContractTemplate` Prisma model authored via TipTap on a full-page editor at `/contracts/templates/[id]`. Issuing a template renders HTML server-side, produces a PDF via `puppeteer-core` + `@sparticuz/chromium`, uploads the blob, creates an `EmploymentContract` row inside a transaction, and emails the staff member via Resend. Existing per-staff issued-contracts table on `/contracts` becomes one of two tabs.

**Tech stack additions:**
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-table`, `@tiptap/extension-link`, `@tiptap/extension-text-align` — rich-text editor
- `puppeteer-core`, `@sparticuz/chromium` — server-side PDF rendering (Vercel-compatible)

**Branch:** `feat/contract-templates`. Single PR when complete.

---

## File structure

### Created
- `prisma/migrations/<timestamp>_add_contract_templates/migration.sql` (Prisma generates)
- `src/lib/contract-templates/merge-tag-catalog.ts` — static catalog of available auto tags
- `src/lib/contract-templates/manual-fields-schema.ts` — Zod schemas for `manualFields` JSON
- `src/lib/contract-templates/sample-data.ts` — sample resolved data for editor preview
- `src/lib/contract-templates/resolve-data.ts` — `resolveTemplateData` (DB → resolved auto tags)
- `src/lib/contract-templates/render-html.ts` — `renderTemplateHtml` (TipTap doc → HTML)
- `src/lib/pdf/render-contract.ts` — `renderContractPdf` (HTML → PDF via Chromium)
- `src/app/api/contract-templates/route.ts` — `GET` (list), `POST` (create)
- `src/app/api/contract-templates/[id]/route.ts` — `GET`, `PATCH`, `DELETE`
- `src/app/api/contract-templates/[id]/clone/route.ts` — `POST`
- `src/app/api/contract-templates/[id]/preview/route.ts` — `POST`
- `src/app/api/contracts/issue-from-template/route.ts` — `POST`
- `src/app/api/contracts/[id]/resend-issue-email/route.ts` — `POST`
- `src/app/(dashboard)/contracts/templates/[id]/page.tsx` — editor page
- `src/components/contracts/templates/TemplatesTable.tsx` — list view
- `src/components/contracts/templates/NewTemplateModal.tsx` — minimal "name it" modal that creates a draft and routes to the editor
- `src/components/contracts/templates/TemplateEditor.tsx` — TipTap editor + autosave
- `src/components/contracts/templates/MergeTagNode.ts` — TipTap custom node (the styled chip)
- `src/components/contracts/templates/MergeTagPanel.tsx` — right-side tag picker
- `src/components/contracts/templates/ManualFieldsPanel.tsx` — bottom field config
- `src/components/contracts/templates/PreviewModal.tsx` — preview against sample data
- `src/components/contracts/IssueFromTemplateModal.tsx` — multi-step issue flow
- `src/hooks/useContractTemplates.ts` — React Query hooks
- `src/lib/email-templates/contracts.ts` — `contractIssuedEmail` template (re-exported by `lib/email-templates.ts`)
- Tests (alongside each module — see each phase)

### Modified
- `prisma/schema.prisma` — add `ContractTemplate` + enum, two cols on `EmploymentContract`, two inverse rels on `User`
- `next.config.ts` — `serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"]`
- `package.json` — new deps
- `src/app/(dashboard)/contracts/page.tsx` — add tabs (Issued / Templates), URL `?tab=`
- `src/components/contracts/NewContractModal.tsx` — add "From template" toggle at top (uses `IssueFromTemplateModal`)
- `src/lib/email-templates.ts` — add `export * from "./email-templates/contracts"`
- `src/app/(dashboard)/my-portal/page.tsx` — show issued contract row + "Resend email" button (admin link only — staff already see the contract)

---

## Phase 0: Branch + dependencies

### Task 0.1: Create feature branch

- [ ] **Step 1:** From clean `main` (after `git pull --ff-only`), create branch.
  ```bash
  git checkout -b feat/contract-templates
  ```

### Task 0.2: Install dependencies

- [ ] **Step 1:** Add deps.
  ```bash
  npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-link @tiptap/extension-text-align puppeteer-core @sparticuz/chromium
  ```
- [ ] **Step 2:** Verify install: `npm run build` should still pass (no code uses these yet, but build verifies they resolve).
- [ ] **Step 3:** Commit.
  ```bash
  git add package.json package-lock.json
  git commit -m "chore(contracts): add tiptap + puppeteer-core deps for templates"
  ```

### Task 0.3: Configure Next.js for Sparticuz Chromium

- [ ] **Step 1:** Edit `next.config.ts`. Add inside the config object:
  ```ts
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  ```
  (Verify the existing config doesn't already define this key; if it does, append to the array.)
- [ ] **Step 2:** Verify build still passes: `npm run build`.
- [ ] **Step 3:** Commit.
  ```bash
  git add next.config.ts
  git commit -m "chore(contracts): mark @sparticuz/chromium + puppeteer-core as serverExternalPackages"
  ```

---

## Phase 1: Schema + migration

### Task 1.1: Add ContractTemplate model + enum

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1:** Add the enum near the other enums (around line 406, after `ContractStatus`):
  ```prisma
  enum ContractTemplateStatus {
    active
    disabled
  }
  ```
- [ ] **Step 2:** Add the model at the end of the file (after the existing employment-contract section, before the next `// ====` divider):
  ```prisma
  model ContractTemplate {
    id              String                  @id @default(cuid())
    name            String
    description     String?                 @db.Text
    contentJson     Json
    manualFields    Json
    status          ContractTemplateStatus  @default(active)
    createdById     String
    createdBy       User                    @relation("TemplateCreator", fields: [createdById], references: [id])
    updatedById     String?
    updatedBy       User?                   @relation("TemplateUpdater", fields: [updatedById], references: [id])
    issuedContracts EmploymentContract[]    @relation("ContractFromTemplate")
    createdAt       DateTime                @default(now())
    updatedAt       DateTime                @updatedAt

    @@index([status])
    @@index([name])
  }
  ```

### Task 1.2: Add columns to EmploymentContract and inverse relations to User

- [ ] **Step 1:** In `model EmploymentContract` (around line 3646), add inside the model body (before the indexes):
  ```prisma
  templateId      String?
  template        ContractTemplate? @relation("ContractFromTemplate", fields: [templateId], references: [id], onDelete: SetNull)
  templateValues  Json?
  ```
- [ ] **Step 2:** Add an index on `templateId`:
  ```prisma
  @@index([templateId])
  ```
- [ ] **Step 3:** In `model User` (find it via `grep -n "^model User " prisma/schema.prisma`), add inverse relations near the other `EmploymentContract[]`-style relations:
  ```prisma
  createdContractTemplates  ContractTemplate[]  @relation("TemplateCreator")
  updatedContractTemplates  ContractTemplate[]  @relation("TemplateUpdater")
  ```

### Task 1.3: Run migration

- [ ] **Step 1:** Run dev migration (creates SQL + applies to dev DB):
  ```bash
  npx prisma migrate dev --name add_contract_templates
  ```
- [ ] **Step 2:** Verify Prisma Client regenerated:
  ```bash
  npx prisma generate
  ```
- [ ] **Step 3:** Verify build passes: `npm run build`.
- [ ] **Step 4:** Commit (migration SQL + schema change together):
  ```bash
  git add prisma/schema.prisma prisma/migrations/
  git commit -m "feat(contracts): ContractTemplate model + EmploymentContract.templateId"
  ```

---

## Phase 2: Pure renderer + supporting modules

### Task 2.1: Merge-tag catalog

**Files:**
- Create: `src/lib/contract-templates/merge-tag-catalog.ts`

- [ ] **Step 1:** Define the static catalog. Shape:
  ```ts
  export type MergeTagGroup = "staff" | "service" | "contract" | "manager" | "system";
  export type MergeTagDef = { key: string; label: string; group: MergeTagGroup; blocking: boolean };
  export const MERGE_TAGS: MergeTagDef[] = [
    // Staff (blocking: true)
    { key: "staff.firstName", label: "Staff: First name", group: "staff", blocking: true },
    { key: "staff.lastName", label: "Staff: Last name", group: "staff", blocking: true },
    { key: "staff.fullName", label: "Staff: Full name", group: "staff", blocking: true },
    { key: "staff.email", label: "Staff: Email", group: "staff", blocking: true },
    { key: "staff.phone", label: "Staff: Phone", group: "staff", blocking: false },
    { key: "staff.address", label: "Staff: Street address", group: "staff", blocking: true },
    { key: "staff.city", label: "Staff: City/Suburb", group: "staff", blocking: true },
    { key: "staff.state", label: "Staff: State", group: "staff", blocking: true },
    { key: "staff.postcode", label: "Staff: Postcode", group: "staff", blocking: true },
    // Service (blocking: true)
    { key: "service.name", label: "Service: Name", group: "service", blocking: true },
    { key: "service.address", label: "Service: Address", group: "service", blocking: false },
    { key: "service.entityName", label: "Service: Legal entity", group: "service", blocking: false },
    // Contract (blocking: true — always provided by issue form)
    { key: "contract.startDate", label: "Contract: Start date", group: "contract", blocking: true },
    { key: "contract.endDate", label: "Contract: End date", group: "contract", blocking: false },
    { key: "contract.payRate", label: "Contract: Pay rate", group: "contract", blocking: true },
    { key: "contract.hoursPerWeek", label: "Contract: Hours per week", group: "contract", blocking: false },
    { key: "contract.position", label: "Contract: Position", group: "contract", blocking: true },
    { key: "contract.contractType", label: "Contract: Type", group: "contract", blocking: true },
    { key: "contract.awardLevel", label: "Contract: Award level", group: "contract", blocking: false },
    // Manager (blocking: false — falls back to empty string)
    { key: "manager.firstName", label: "Manager: First name", group: "manager", blocking: false },
    { key: "manager.lastName", label: "Manager: Last name", group: "manager", blocking: false },
    { key: "manager.fullName", label: "Manager: Full name", group: "manager", blocking: false },
    { key: "manager.title", label: "Manager: Title", group: "manager", blocking: false },
    // System (blocking: false — always resolves)
    { key: "today", label: "System: Today's date", group: "system", blocking: false },
    { key: "letterDate", label: "System: Letter date (long format)", group: "system", blocking: false },
  ];
  export const MERGE_TAGS_BY_KEY: Record<string, MergeTagDef> = Object.fromEntries(MERGE_TAGS.map((t) => [t.key, t]));
  ```
- [ ] **Step 2:** Commit.
  ```bash
  git add src/lib/contract-templates/merge-tag-catalog.ts
  git commit -m "feat(contracts): merge-tag catalog"
  ```

### Task 2.2: Manual fields Zod schema + types

**Files:**
- Create: `src/lib/contract-templates/manual-fields-schema.ts`
- Create: `src/__tests__/lib/contract-templates/manual-fields-schema.test.ts`

- [ ] **Step 1: Write failing test.**
  ```ts
  import { manualFieldsSchema } from "@/lib/contract-templates/manual-fields-schema";
  import { describe, it, expect } from "vitest";

  describe("manualFieldsSchema", () => {
    it("accepts a valid field array", () => {
      const out = manualFieldsSchema.safeParse([
        { key: "probationPeriod", label: "Probation period", type: "text", required: false, default: "6 months" },
      ]);
      expect(out.success).toBe(true);
    });
    it("rejects duplicate keys", () => {
      const out = manualFieldsSchema.safeParse([
        { key: "x", label: "X", type: "text", required: true },
        { key: "x", label: "X again", type: "date", required: false },
      ]);
      expect(out.success).toBe(false);
    });
    it("rejects keys that collide with the auto-tag catalog", () => {
      const out = manualFieldsSchema.safeParse([
        { key: "staff.firstName", label: "Bad", type: "text", required: false },
      ]);
      expect(out.success).toBe(false);
    });
    it("rejects bad type values", () => {
      const out = manualFieldsSchema.safeParse([{ key: "x", label: "X", type: "bogus", required: true }]);
      expect(out.success).toBe(false);
    });
  });
  ```
- [ ] **Step 2: Run test → fails:** `npx vitest run src/__tests__/lib/contract-templates/manual-fields-schema.test.ts`
- [ ] **Step 3: Implement.**
  ```ts
  import { z } from "zod";
  import { MERGE_TAGS_BY_KEY } from "./merge-tag-catalog";

  export const manualFieldSchema = z.object({
    key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Key must be a valid identifier"),
    label: z.string().min(1),
    type: z.enum(["text", "longtext", "date", "number"]),
    required: z.boolean(),
    default: z.string().optional(),
  });

  export const manualFieldsSchema = z.array(manualFieldSchema).superRefine((fields, ctx) => {
    const seen = new Set<string>();
    for (const f of fields) {
      if (seen.has(f.key)) ctx.addIssue({ code: "custom", message: `Duplicate key: ${f.key}` });
      seen.add(f.key);
      if (MERGE_TAGS_BY_KEY[f.key]) ctx.addIssue({ code: "custom", message: `Key "${f.key}" collides with a built-in merge tag` });
    }
  });

  export type ManualField = z.infer<typeof manualFieldSchema>;
  ```
- [ ] **Step 4: Run test → passes.**
- [ ] **Step 5: Commit.**
  ```bash
  git add src/lib/contract-templates/manual-fields-schema.ts src/__tests__/lib/contract-templates/manual-fields-schema.test.ts
  git commit -m "feat(contracts): manual-fields zod schema with key collision guard"
  ```

### Task 2.3: Sample data for preview

**Files:**
- Create: `src/lib/contract-templates/sample-data.ts`

- [ ] **Step 1:** Hard-coded sample dictionary covering every catalog tag, used by the editor preview when no real staff is picked.
  ```ts
  export const SAMPLE_RESOLVED_AUTO: Record<string, string> = {
    "staff.firstName": "Sarah", "staff.lastName": "Doe", "staff.fullName": "Sarah Doe",
    "staff.email": "sarah.doe@example.com", "staff.phone": "0400 000 000",
    "staff.address": "12 Example Street", "staff.city": "Bonnyrigg", "staff.state": "NSW", "staff.postcode": "2177",
    "service.name": "Bonnyrigg OSHC", "service.address": "1 School Lane, Bonnyrigg NSW 2177", "service.entityName": "Amana OSHC Pty Ltd",
    "contract.startDate": "1 February 2026", "contract.endDate": "", "contract.payRate": "$32.50",
    "contract.hoursPerWeek": "38", "contract.position": "Director of Service",
    "contract.contractType": "Part-time permanent", "contract.awardLevel": "Director",
    "manager.firstName": "Daniel", "manager.lastName": "Khoury", "manager.fullName": "Daniel Khoury", "manager.title": "State Manager",
    today: new Date().toLocaleDateString("en-AU"), letterDate: new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }),
  };
  ```
- [ ] **Step 2:** Commit.
  ```bash
  git add src/lib/contract-templates/sample-data.ts
  git commit -m "feat(contracts): sample resolved data for editor preview"
  ```

### Task 2.4: `resolveTemplateData` (DB → resolved auto-tag dict)

**Files:**
- Create: `src/lib/contract-templates/resolve-data.ts`
- Create: `src/__tests__/lib/contract-templates/resolve-data.test.ts`

Reads `User`, `Service`, `Service.manager`. Returns `{ resolved: Record<string,string>, missingBlocking: string[] }`. Pure data formatting — no rendering.

- [ ] **Step 1: Write failing test** covering: happy path, missing staff address (blocking), missing manager (non-blocking → empty string), date formatting (AU long form for `letterDate`, short form for `today`), currency formatting for pay rate, contract-type label mapping. Mock Prisma per existing pattern (`src/__tests__/helpers/prisma-mock.ts`).
- [ ] **Step 2: Run → fails.**
- [ ] **Step 3: Implement.** Signature:
  ```ts
  export async function resolveTemplateData(args: {
    userId: string;
    contractMeta: {
      contractType: ContractType;
      awardLevel?: AwardLevel | null;
      awardLevelCustom?: string | null;
      payRate: number;
      hoursPerWeek?: number | null;
      startDate: Date;
      endDate?: Date | null;
      position: string;
    };
  }): Promise<{ resolved: Record<string, string>; missingBlocking: string[] }>;
  ```
  - Fetch user with `service: { include: { manager: true } }`
  - Resolve every key in `MERGE_TAGS_BY_KEY`. Use the catalog's `blocking` field to decide what counts as missing.
  - Format dates with `toLocaleDateString("en-AU", ...)`. Format pay rate as `$X.YY`. Map `contract.contractType` enum to friendly label using existing `CONTRACT_TYPE_LABELS` from `src/components/contracts/constants.ts`.
- [ ] **Step 4: Run → passes.**
- [ ] **Step 5: Commit.**
  ```bash
  git add src/lib/contract-templates/resolve-data.ts src/__tests__/lib/contract-templates/resolve-data.test.ts
  git commit -m "feat(contracts): resolveTemplateData — DB → resolved auto-tag dict"
  ```

### Task 2.5: `renderTemplateHtml` (TipTap doc → HTML)

**Files:**
- Create: `src/lib/contract-templates/render-html.ts`
- Create: `src/__tests__/lib/contract-templates/render-html.test.ts`

Walks the TipTap doc tree, replaces `mergeTag` nodes with values, returns HTML + a list of any tags referenced in the doc that aren't in the resolved dict. Pure / sync.

- [ ] **Step 1: Write failing tests:**
  - Doc with one `mergeTag` node renders the value
  - Doc with a `mergeTag` whose key isn't in `data` renders `<span class="missing">{{key}}</span>` and is listed in `missingTags`
  - HTML in user data is escaped (e.g. value = `<script>alert(1)</script>` becomes `&lt;script&gt;...`)
  - Headings, bold, italic, lists, tables all render to expected HTML tags
  - Page-break marker becomes `<div style="page-break-before: always"></div>`
- [ ] **Step 2: Run → fails.**
- [ ] **Step 3: Implement.** Signature:
  ```ts
  export type TipTapNode = { type: string; attrs?: Record<string, unknown>; content?: TipTapNode[]; text?: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> };
  export type TipTapDoc = { type: "doc"; content?: TipTapNode[] };

  export function renderTemplateHtml(args: {
    doc: TipTapDoc;
    data: Record<string, string>;
  }): { html: string; missingTags: string[] };
  ```
  - Switch on `node.type` for: `doc`, `paragraph`, `heading`, `bulletList`, `orderedList`, `listItem`, `blockquote`, `table`, `tableRow`, `tableCell`, `tableHeader`, `text`, `mergeTag`, `pageBreak`, `hardBreak`
  - Apply `marks` (`bold`, `italic`, `underline`, `strike`, `link`) by wrapping
  - Use a small `escapeHtml(s: string)` helper for all string interpolation
  - Wrap final output in `<!doctype html><html><head><style>...</style></head><body>${body}</body></html>` with print-friendly CSS (A4-friendly margins, serif font, page-break utility)
- [ ] **Step 4: Run → passes.**
- [ ] **Step 5: Commit.**
  ```bash
  git add src/lib/contract-templates/render-html.ts src/__tests__/lib/contract-templates/render-html.test.ts
  git commit -m "feat(contracts): renderTemplateHtml — TipTap doc → HTML with merge-tag substitution"
  ```

---

## Phase 3: PDF service

### Task 3.1: `renderContractPdf`

**Files:**
- Create: `src/lib/pdf/render-contract.ts`

`puppeteer-core` + `@sparticuz/chromium` with a per-Lambda singleton browser. No unit test — Chromium is too heavy for CI. We smoke-test via the issue route's integration test (with the renderer mocked) and manually on the first preview deploy.

- [ ] **Step 1:** Implementation:
  ```ts
  import chromium from "@sparticuz/chromium";
  import puppeteer, { Browser } from "puppeteer-core";

  declare global {
    var __contractBrowser: Browser | undefined;
  }

  async function getBrowser(): Promise<Browser> {
    if (globalThis.__contractBrowser) return globalThis.__contractBrowser;
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    globalThis.__contractBrowser = browser;
    return browser;
  }

  export async function renderContractPdf(html: string): Promise<Buffer> {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({
        format: "A4",
        margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `<div></div>`,
        footerTemplate: `<div style="font-size:9px;color:#666;width:100%;text-align:center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }
  ```
- [ ] **Step 2:** Smoke-test locally if you have Chrome installed:
  ```bash
  npx tsx -e "import('./src/lib/pdf/render-contract.ts').then(async ({ renderContractPdf }) => { const buf = await renderContractPdf('<h1>Hello</h1>'); require('fs').writeFileSync('/tmp/test.pdf', buf); console.log('ok'); })"
  ```
  Skip if Chrome not installed locally — the test on Vercel preview deploy is the real check.
- [ ] **Step 3:** Commit.
  ```bash
  git add src/lib/pdf/render-contract.ts
  git commit -m "feat(contracts): renderContractPdf via @sparticuz/chromium + puppeteer-core"
  ```

---

## Phase 4: API CRUD routes

### Task 4.1: `GET /api/contract-templates` + `POST /api/contract-templates`

**Files:**
- Create: `src/app/api/contract-templates/route.ts`
- Create: `src/__tests__/api/contract-templates.test.ts`

- [ ] **Step 1: Write failing tests** (auth 401, role 403, validation 400, happy GET, happy POST creates row + ActivityLog). Mock prisma per existing pattern; use `mockSession` from `@/__tests__/helpers/auth-mock`.
- [ ] **Step 2: Run → fails.**
- [ ] **Step 3: Implement.**
  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { z } from "zod";
  import { prisma } from "@/lib/prisma";
  import { withApiAuth } from "@/lib/server-auth";
  import { parseJsonBody, ApiError } from "@/lib/api-error";
  import { manualFieldsSchema } from "@/lib/contract-templates/manual-fields-schema";

  const listQuerySchema = z.object({ status: z.enum(["active","disabled"]).optional(), search: z.string().optional() });

  const createSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    contentJson: z.unknown(),                       // TipTap doc; structurally validated by the editor
    manualFields: manualFieldsSchema,
  });

  export const GET = withApiAuth(async (req) => {
    const url = new URL(req.url);
    const { status, search } = listQuerySchema.parse({ status: url.searchParams.get("status") ?? undefined, search: url.searchParams.get("search") ?? undefined });
    const templates = await prisma.contractTemplate.findMany({
      where: { ...(status ? { status } : {}), ...(search ? { name: { contains: search, mode: "insensitive" } } : {}) },
      include: { createdBy: { select: { id: true, name: true } }, updatedBy: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(templates);
  }, { roles: ["owner","admin"], feature: "contracts.view" });

  export const POST = withApiAuth(async (req, session) => {
    const body = await parseJsonBody(req);
    const data = createSchema.parse(body);
    const tpl = await prisma.$transaction(async (tx) => {
      const created = await tx.contractTemplate.create({
        data: { ...data, contentJson: data.contentJson as object, createdById: session!.user.id },
      });
      await tx.activityLog.create({ data: { userId: session!.user.id, action: "create", entityType: "ContractTemplate", entityId: created.id, details: { name: created.name } } });
      return created;
    });
    return NextResponse.json(tpl, { status: 201 });
  }, { roles: ["owner","admin"], feature: "contracts.create" });
  ```
- [ ] **Step 4: Run → passes.**
- [ ] **Step 5: Commit.**

### Task 4.2: `GET/PATCH/DELETE /api/contract-templates/[id]`

**Files:**
- Create: `src/app/api/contract-templates/[id]/route.ts`
- Create: `src/__tests__/api/contract-templates-by-id.test.ts`

- [ ] **Step 1: Write failing tests:** auth/role; GET 404; PATCH partial update; PATCH sets `updatedById`; PATCH writing `status: disabled` logs `disable` action; PATCH writing `status: active` (when previously disabled) logs `enable` action; DELETE happy; DELETE returns 409 if any `EmploymentContract.templateId === id`.
- [ ] **Step 2: Implement.** PATCH schema is `createSchema.partial().extend({ status: z.enum(["active","disabled"]).optional() })`. DELETE uses `prisma.employmentContract.count({ where: { templateId: id } })` for the 409 guard.
- [ ] **Step 3: Run → passes.**
- [ ] **Step 4: Commit.**

### Task 4.3: `POST /api/contract-templates/[id]/clone`

**Files:**
- Create: `src/app/api/contract-templates/[id]/clone/route.ts`
- Create: `src/__tests__/api/contract-templates-clone.test.ts`

- [ ] **Step 1: Test:** clone returns new template with name `"<original> (copy)"`, status `active`, distinct id, copies content + manualFields verbatim, logs `clone` activity with `details: { sourceId }`.
- [ ] **Step 2: Implement.** Single transaction: `findUniqueOrThrow` → `create` → `activityLog.create`.
- [ ] **Step 3: Commit.**

### Task 4.4: `POST /api/contract-templates/[id]/preview`

**Files:**
- Create: `src/app/api/contract-templates/[id]/preview/route.ts`
- Create: `src/__tests__/api/contract-templates-preview.test.ts`

Returns rendered HTML against either sample data or a real staff member's resolved data (caller picks). No PDF, no DB writes.

- [ ] **Step 1: Test:** request body `{ userId?: string }`. With `userId`, calls `resolveTemplateData` and renders against real data. Without, renders against `SAMPLE_RESOLVED_AUTO`. Returns `{ html, missingTags }`.
- [ ] **Step 2: Implement.** Use the wrapper option `rateLimit: { max: 20, windowMs: 60_000 }`.
- [ ] **Step 3: Commit.**

---

## Phase 5: Issue + resend routes

### Task 5.1: `POST /api/contracts/issue-from-template`

**Files:**
- Create: `src/app/api/contracts/issue-from-template/route.ts`
- Create: `src/__tests__/api/issue-from-template.test.ts`

Per the spec's "Server-side issue handler" section. Single most important route — get the failure semantics right.

- [ ] **Step 1:** Mock `renderContractPdf` (returns a dummy `Buffer.from("PDF")`), `uploadFile` (returns `{ url: "https://blob.test/xyz.pdf", size: 4 }`), and `sendEmail` (returns success). Write tests:
  - Auth 401 / role 403
  - Validation 400 (bad body)
  - Template disabled → 400 with message
  - Required Staff-group tag missing → 400 listing missing fields
  - Happy path:
    - Creates `EmploymentContract` with `status: "active"`, `templateId`, `templateValues: { auto, manual }`, `documentUrl` set
    - Creates `ActivityLog` with `action: "issue_from_template"`, `entityType: "EmploymentContract"`, `details: { templateId, templateName }`
    - Both inside a single `prisma.$transaction` (assert by checking the call shape)
    - Calls `sendEmail` with `to: staff.email`, subject from `contractIssuedEmail`
    - Returns 201 with the new contract
  - **PDF render failure** → 500, no DB row, no upload happened
  - **Upload failure** → 500, no DB row
  - **Email failure** → contract STILL created (200/201 path), failure logged via `logger.error`, response includes `{ emailFailed: true }` so the UI can warn the admin
- [ ] **Step 2:** Implementation skeleton:
  ```ts
  const issueSchema = z.object({
    templateId: z.string().min(1),
    userId: z.string().min(1),
    contractMeta: z.object({
      contractType: z.enum(["ct_casual","ct_part_time","ct_permanent","ct_fixed_term"]),
      awardLevel: z.enum(["es1","es2","es3","es4","cs1","cs2","cs3","cs4","director","coordinator","custom"]).nullish(),
      awardLevelCustom: z.string().nullish(),
      payRate: z.number().positive(),
      hoursPerWeek: z.number().positive().nullish(),
      startDate: z.string(),
      endDate: z.string().nullish(),
      position: z.string().min(1),
    }),
    manualValues: z.record(z.string(), z.string()),
  });

  export const POST = withApiAuth(async (req, session) => {
    const body = await parseJsonBody(req);
    const data = issueSchema.parse(body);

    const template = await prisma.contractTemplate.findUnique({ where: { id: data.templateId } });
    if (!template) throw ApiError.notFound("Template not found");
    if (template.status === "disabled") throw ApiError.badRequest("Template is disabled");

    const startDate = new Date(data.contractMeta.startDate);
    const endDate = data.contractMeta.endDate ? new Date(data.contractMeta.endDate) : null;

    const { resolved, missingBlocking } = await resolveTemplateData({
      userId: data.userId,
      contractMeta: { ...data.contractMeta, startDate, endDate, position: data.contractMeta.position },
    });
    if (missingBlocking.length) throw ApiError.badRequest(`Missing required staff fields: ${missingBlocking.join(", ")}`);

    const allData = { ...resolved, ...data.manualValues };
    const { html, missingTags } = renderTemplateHtml({ doc: template.contentJson as TipTapDoc, data: allData });
    if (missingTags.length) throw ApiError.badRequest(`Template references unknown tags: ${missingTags.join(", ")}`);

    const pdf = await renderContractPdf(html);
    const { url } = await uploadFile(pdf, `contract-${data.userId}-${Date.now()}.pdf`, { contentType: "application/pdf", folder: "contracts/issued" });

    const contract = await prisma.$transaction(async (tx) => {
      const created = await tx.employmentContract.create({
        data: {
          userId: data.userId,
          contractType: data.contractMeta.contractType,
          awardLevel: data.contractMeta.awardLevel ?? null,
          awardLevelCustom: data.contractMeta.awardLevelCustom ?? null,
          payRate: data.contractMeta.payRate,
          hoursPerWeek: data.contractMeta.hoursPerWeek ?? null,
          startDate, endDate,
          status: "active",
          documentUrl: url,
          templateId: template.id,
          templateValues: { auto: resolved, manual: data.manualValues },
        },
      });
      await tx.activityLog.create({
        data: { userId: session!.user.id, action: "issue_from_template", entityType: "EmploymentContract", entityId: created.id, details: { templateId: template.id, templateName: template.name } },
      });
      return created;
    });

    let emailFailed = false;
    try {
      const staff = await prisma.user.findUniqueOrThrow({ where: { id: data.userId }, select: { email: true, name: true } });
      const portalUrl = `${process.env.NEXTAUTH_URL}/my-portal?contract=${contract.id}`;
      const { subject, html: emailHtml } = contractIssuedEmail({ name: staff.name ?? "there", contractName: template.name, portalUrl, pdfUrl: url });
      await sendEmail({ to: staff.email, subject, html: emailHtml });
    } catch (err) {
      emailFailed = true;
      logger.error("issue-from-template: email send failed", { contractId: contract.id, err });
    }

    return NextResponse.json({ ...contract, emailFailed }, { status: 201 });
  }, { roles: ["owner","admin"], feature: "contracts.create", rateLimit: { max: 10, windowMs: 60_000 } });

  export const maxDuration = 30;
  ```
- [ ] **Step 3: Run → passes.**
- [ ] **Step 4: Commit.**

### Task 5.2: `POST /api/contracts/[id]/resend-issue-email`

**Files:**
- Create: `src/app/api/contracts/[id]/resend-issue-email/route.ts`
- Create: `src/__tests__/api/contracts-resend-issue-email.test.ts`

- [ ] **Step 1: Test:** auth/role; 404 if contract not found; 400 if contract has no `documentUrl`; happy path sends email and logs activity.
- [ ] **Step 2: Implement.** Looks up contract, fetches staff, calls `contractIssuedEmail` with the existing `documentUrl`, sends, logs `resend_issue_email` activity.
- [ ] **Step 3: Commit.**

---

## Phase 6: React Query hooks

### Task 6.1: `useContractTemplates` hook

**Files:**
- Create: `src/hooks/useContractTemplates.ts`

- [ ] **Step 1:** Implement using existing pattern (mirror `useContracts.ts`):
  - `useContractTemplates({ status?, search? })` — `useQuery`, `retry: 2`, `staleTime: 30_000`, primitive query keys
  - `useContractTemplate(id)` — single fetch
  - `useCreateContractTemplate()` — `useMutation` with `onError` toast
  - `useUpdateContractTemplate()` — partial update; invalidates list + single
  - `useCloneContractTemplate()`
  - `useDeleteContractTemplate()`
  - `usePreviewContractTemplate()` — POST to preview, returns HTML
  - `useIssueFromTemplate()` — POST to issue route; on success shows toast (warn variant if `emailFailed`)
  - `useResendIssueEmail()` — POST to resend
- [ ] **Step 2:** All mutations must have `onError: (err) => toast({ variant: "destructive", description: err.message })`. All queries must have `retry: 2` + `staleTime`.
- [ ] **Step 3: Commit.**

---

## Phase 7: Templates list UI (tab + table)

### Task 7.1: Convert `/contracts` page to a tabs layout

**Files:**
- Modify: `src/app/(dashboard)/contracts/page.tsx`

- [ ] **Step 1:** Read URL `?tab=` (default `issued`). Render two tab buttons; the Templates tab is hidden if `!hasMinRole(role, "admin")`.
- [ ] **Step 2:** When `tab === "issued"`, render the existing layout (summary cards + `ContractsTable` + modals) unchanged.
- [ ] **Step 3:** When `tab === "templates"`, render a new section:
  - PageHeader "Contract Templates" + primary action "New Template" (admin only)
  - `<TemplatesTable />` (Task 7.2)
- [ ] **Step 4:** Verify the existing Issued tab still passes its smoke test (`src/__tests__/components/contracts-page.smoke.test.tsx`).
- [ ] **Step 5: Commit.**

### Task 7.2: `TemplatesTable` component

**Files:**
- Create: `src/components/contracts/templates/TemplatesTable.tsx`

- [ ] **Step 1:** Columns: Name, Last edited (formatted date), Updated by (name), Status (active/disabled badge), Actions (View → routes to `/contracts/templates/[id]`, Edit → same as View, Clone → calls `useCloneContractTemplate`, Disable/Enable → calls `useUpdateContractTemplate({ status })`, Delete → calls `useDeleteContractTemplate`; on 409 error toast says "This template is in use; disable it instead").
- [ ] **Step 2:** Filter bar: search input + status dropdown. Empty state with `EmptyState` component.
- [ ] **Step 3:** Loading + error handling via `ErrorState` and skeleton, matching `ContractsTable` pattern.
- [ ] **Step 4:** Smoke test: render with empty list shows EmptyState; render with one row shows the row.
- [ ] **Step 5: Commit.**

### Task 7.3: `NewTemplateModal` (name-only modal that creates draft)

**Files:**
- Create: `src/components/contracts/templates/NewTemplateModal.tsx`

- [ ] **Step 1:** Single field (name) + Create button. On submit, calls `useCreateContractTemplate` with `{ name, contentJson: { type: "doc", content: [] }, manualFields: [] }`. On success, routes to `/contracts/templates/<newId>`.
- [ ] **Step 2:** Wire into `/contracts` page header "New Template" action.
- [ ] **Step 3: Commit.**

---

## Phase 8: Template editor UI

### Task 8.1: Editor route page shell

**Files:**
- Create: `src/app/(dashboard)/contracts/templates/[id]/page.tsx`

- [ ] **Step 1:** Server component that does the auth check (admin only; redirect to `/contracts` for others), then renders a client component `TemplateEditor` passing the template id.
- [ ] **Step 2:** Loading.tsx with editor-shaped skeleton.
- [ ] **Step 3: Commit.**

### Task 8.2: `MergeTagNode` (TipTap custom node)

**Files:**
- Create: `src/components/contracts/templates/MergeTagNode.ts`

- [ ] **Step 1:** Inline atom node with `attrs: { key }`. Renders to HTML as `<span data-merge-tag="${key}">{{${key}}}</span>` and to ReactNode in the editor as a styled blue pill (matches Employment Hero look). Implement as a TipTap `Node.create({ name: "mergeTag", group: "inline", inline: true, atom: true, ... })`.
- [ ] **Step 2:** Add a serializer test (round-trip JSON → HTML) under `src/__tests__/components/merge-tag-node.test.ts`.
- [ ] **Step 3: Commit.**

### Task 8.3: `TemplateEditor` (TipTap setup + autosave)

**Files:**
- Create: `src/components/contracts/templates/TemplateEditor.tsx`

- [ ] **Step 1:** Setup TipTap with extensions: StarterKit, Table, TableRow, TableCell, TableHeader, Link, TextAlign, MergeTagNode. Show toolbar (paragraph, h1-3, bold, italic, underline, strike, lists, blockquote, table insert, alignment, link, page-break).
- [ ] **Step 2:** Header bar: editable name input, status pill + toggle button, Preview button, dirty-state indicator.
- [ ] **Step 3:** Autosave: debounced 5s + on blur. Show "Saving…" / "Saved 12s ago". Last-write-wins (no optimistic concurrency in v1).
- [ ] **Step 4:** Layout: editor takes most of width; right column is `MergeTagPanel`; below editor is `ManualFieldsPanel`. On mobile, stack panels below editor.
- [ ] **Step 5: Commit.**

### Task 8.4: `MergeTagPanel` (right-side picker)

**Files:**
- Create: `src/components/contracts/templates/MergeTagPanel.tsx`

- [ ] **Step 1:** Renders `MERGE_TAGS` grouped by `group`, plus a "Manual" group showing `manualFields` keys passed as a prop. Click a tag → calls `editor.chain().focus().insertContent({ type: "mergeTag", attrs: { key } }).run()`.
- [ ] **Step 2:** Search input at top filters by label.
- [ ] **Step 3: Commit.**

### Task 8.5: `ManualFieldsPanel` (declare per-template manual fields)

**Files:**
- Create: `src/components/contracts/templates/ManualFieldsPanel.tsx`

- [ ] **Step 1:** Repeatable list. Each row: key input, label input, type dropdown, required toggle, default input, remove button. Add row button.
- [ ] **Step 2:** On change, calls a parent-supplied `onChange(fields)` — parent (`TemplateEditor`) sends the updated array to the autosave queue.
- [ ] **Step 3:** Live validation against `manualFieldsSchema` (Zod) — show inline errors.
- [ ] **Step 4: Commit.**

### Task 8.6: `PreviewModal`

**Files:**
- Create: `src/components/contracts/templates/PreviewModal.tsx`

- [ ] **Step 1:** Modal with an iframe (sandbox = `allow-same-origin`). Fetches `/api/contract-templates/[id]/preview` (no `userId` → uses sample data). Renders the returned HTML inside the iframe.
- [ ] **Step 2:** Bottom action bar: close button.
- [ ] **Step 3: Commit.**

---

## Phase 9: Issue from template modal

### Task 9.1: `IssueFromTemplateModal` stepper

**Files:**
- Create: `src/components/contracts/IssueFromTemplateModal.tsx`

5 steps as in the spec. Use existing modal styling (mirror `NewContractModal`).

- [ ] **Step 1: Step 1 — template + staff:** two dropdowns. "Next" button enabled when both set.
- [ ] **Step 2: Step 2 — auto-resolve review:** calls `/api/contract-templates/[id]/preview` with the chosen userId, displays the resolved tag dictionary as a key→value table. If `missingTags` includes any blocking Staff-group tags, show inline red flag with "Fix on staff profile →" deep link to `/users/[id]` (or wherever the staff edit lives — `grep -n` for the existing route). Block "Next" until missing list is empty.
- [ ] **Step 3: Step 3 — manual fields:** form rendered from the template's `manualFields`. Skip step entirely if `manualFields.length === 0`. Validate (required + type).
- [ ] **Step 4: Step 4 — contract metadata:** the same fields the existing `NewContractModal` collects (contract type, award level, pay rate, hours/wk, start date, end date, position). Auto-prefill where a `manualValues` key matches a metadata key.
- [ ] **Step 5: Step 5 — preview + confirm:** re-fetches preview with all data merged. Shows in a side iframe. "Issue & Email" button calls `useIssueFromTemplate`. On success: close modal, toast (warn variant if `emailFailed: true`), invalidate contracts list. On error: toast.
- [ ] **Step 6: Commit.**

### Task 9.2: Wire the existing `NewContractModal` to offer "From template"

**Files:**
- Modify: `src/components/contracts/NewContractModal.tsx`

- [ ] **Step 1:** Top-of-modal pill toggle: `From template` (default if any active templates exist) vs `Blank`. When `From template` selected, render `<IssueFromTemplateModal />` and unmount the existing form. When `Blank`, keep the existing form unchanged.
- [ ] **Step 2: Commit.**

---

## Phase 10: Email + my-portal wiring

### Task 10.1: `contractIssuedEmail` template

**Files:**
- Create: `src/lib/email-templates/contracts.ts`
- Modify: `src/lib/email-templates.ts`

- [ ] **Step 1:** Implement `contractIssuedEmail({ name, contractName, portalUrl, pdfUrl })` returning `{ subject, html }`. Use `baseLayout` + `buttonHtml` from `./email-templates/base` (mirror `notifications.ts` pattern).
  - Subject: `"Your new contract from Amana OSHC — please review"`
  - Body: greeting, "We've issued your `<contractName>`. Please review and acknowledge it in your portal.", primary CTA button → `portalUrl`, secondary plain link → `pdfUrl` ("Download PDF directly").
- [ ] **Step 2:** Add `export * from "./email-templates/contracts";` to `src/lib/email-templates.ts`.
- [ ] **Step 3:** Snapshot test: rendered HTML contains the contract name, the portal URL, and the button.
- [ ] **Step 4: Commit.**

### Task 10.2: `/my-portal` resend button

**Files:**
- Modify: `src/app/(dashboard)/my-portal/page.tsx`

The staff already see their contracts on `/my-portal`; this task adds a small **admin-only** "Resend email" button on each contract row that calls `useResendIssueEmail`. Staff don't see it.

- [ ] **Step 1:** Read the contract list rendering area; add a `{role admin/owner only}` button next to each row. On click, call the hook; on success, toast success.
- [ ] **Step 2: Commit.**

---

## Phase 11: End-to-end + verification

### Task 11.1: Playwright e2e

**Files:**
- Create: `tests/e2e/contract-templates.spec.ts`

Mock the Chromium renderer at the route boundary (env-flag `MOCK_PDF=1` → server returns `Buffer.from("PDF")`). The point of e2e is data flow, not Chromium fidelity.

- [ ] **Step 1:** Test scenario:
  1. Seed a `ContractTemplate` (admin-created in test setup).
  2. Admin logs in → navigates to `/contracts?tab=templates` → opens the template, sees it.
  3. Admin clicks "New Contract" → "From template" → walks the 5-step modal → issues.
  4. Assert: `EmploymentContract` row exists with `templateId` set.
  5. Staff logs in → opens `/my-portal` → sees the contract → clicks "I acknowledge".
  6. Assert: `acknowledgedByStaff` is `true`.
- [ ] **Step 2:** Run: `npm run test:e2e -- contract-templates.spec.ts`. Expect pass.
- [ ] **Step 3: Commit.**

### Task 11.2: Final verification checklist

- [ ] **Step 1:** `npm run build` passes
- [ ] **Step 2:** `npm test` passes (3014+ existing + new)
- [ ] **Step 3:** `npm run test:integration` passes
- [ ] **Step 4:** `npm run lint` passes
- [ ] **Step 5:** Verify in dev:
  - Create a template at `/contracts?tab=templates` → "New Template"
  - Edit the template; insert a few merge tags; declare one manual field
  - Save (autosave) and reload — content persists
  - Click Preview — see rendered sample data
  - Disable the template — it disappears from the issue picker
  - Re-enable; clone — both copies exist
  - Issue the cloned template to a staff member — preview step shows resolved tags
  - Submit "Issue & Email" — contract appears on `/contracts` Issued tab; PDF downloads correctly
  - Log in as the staff member — see contract on `/my-portal`; acknowledge it
- [ ] **Step 6:** Verify in Vercel preview deploy: the issue route doesn't time out and the Lambda size stays under 250MB. If not, follow the Bundle/deployment notes in the spec (split route to its own region or move PDF rendering external).

### Task 11.3: PR

- [ ] **Step 1:** Open PR with title `feat(contracts): template library + issue-from-template flow`.
- [ ] **Step 2:** PR body summary points: spec link, scope (templates CRUD + issue flow), what's NOT in scope (e-signatures, versioning, bulk-issue, other doc types), how to verify (link to checklist above).
- [ ] **Step 3:** Test plan in PR body covers: admin creates template, admin issues to staff, staff acknowledges, disable/clone/delete behavior, email sent, PDF accessible.

---

## Skills to reference during execution

- `superpowers:test-driven-development` — write the test first; watch it fail; minimal implementation; watch it pass; commit
- `superpowers:verification-before-completion` — run `npm run build` + `npm test` + the in-dev verification checklist before claiming the feature is done
- `superpowers:requesting-code-review` — after Phase 11, request review on the PR

## Open items the executing engineer must resolve in-flight

1. **Vercel Lambda size on first preview deploy** — if `@sparticuz/chromium` pushes the issue route over 250MB unzipped, follow spec's "Bundle / deployment notes" — first option is region-pin, second is external PDF service.
2. **Staff profile route for "Fix on staff profile →" deep link in Step 2 of the issue modal** — `grep -rn "users/\[id\]" src/app/(dashboard)/` to find the canonical edit route.
3. **Manager title field on User** — the spec assumes `manager.title` resolves to something. If `User` has no `title`/`jobTitle` column, fall back to a hard-coded `"Director"` or `""`. (Confirm via `grep -n "title\|jobTitle" prisma/schema.prisma | head -10`.)
