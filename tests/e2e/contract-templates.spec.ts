/**
 * E2E: Contract-templates flow
 *
 * Covers:
 *  1. Admin logs in → navigates to /contracts?tab=templates → seeded template visible
 *  2. Admin clicks "New Contract" on Issued tab → IssueFromTemplateModal opens
 *  3. Walks through the 3-step modal (choose → contract details → review & sign;
 *     a "fill custom fields" step appears only when the template has manual fields)
 *  4. Admin signs the signature pad → "Sign & Issue" → modal closes → contract row appears
 *  5. DB assertions: EmploymentContract has templateId, templateValues, documentUrl
 *  6. Staff logs in → My Portal shows the contract → staff clicks "Acknowledge Contract"
 *  7. DB assertion: acknowledgedByStaff === true
 *
 * PDF rendering is bypassed via MOCK_PDF=1 (see playwright.config.ts webServer.env
 * and src/lib/pdf/render-contract.ts). The Vercel Blob upload is also mocked under
 * the same flag (see src/lib/storage.ts). The email send is a non-fatal error path
 * when RESEND_API_KEY is absent, so no extra mocking is needed.
 *
 * Run locally:
 *   MOCK_PDF=1 npm run test:e2e -- tests/e2e/contract-templates.spec.ts
 * (The local dev server started by playwright.config.ts already sets MOCK_PDF=1.)
 */

import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { loginViaUi, TEST_PASSWORD } from "./helpers/session";

// ── Prisma client (out-of-process from the Next.js server) ───────────────────
const prisma = new PrismaClient();

// ── Storage paths for session state ──────────────────────────────────────────
const AUTH_DIR = path.join(__dirname, "../../.playwright/auth");
const ADMIN_SESSION = path.join(AUTH_DIR, "ct-e2e-admin.json");
const STAFF_SESSION = path.join(AUTH_DIR, "ct-e2e-staff.json");

// ── Test-local state (written in beforeAll, read in tests) ───────────────────
let seededTemplateId: string;
let seededAdminId: string;
let seededStaffId: string;
let seededServiceId: string;
let issuedContractId: string;

const unique = crypto.randomUUID().slice(0, 8);
const adminEmail = `ct-e2e-admin+${unique}@amana-test.local`;
const staffEmail = `ct-e2e-staff+${unique}@amana-test.local`;
const PASSWORD_HASH = hashSync(TEST_PASSWORD, 10);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loginAs(
  page: import("@playwright/test").Page,
  email: string,
  sessionPath: string,
): Promise<void> {
  // Shared UI login (helpers/session.ts) — waits to leave /login and stamps
  // the welcome-tour flag before the storage state is saved.
  await loginViaUi(page, email, { saveStatePath: sessionPath });
}

// ── Seed / cleanup ────────────────────────────────────────────────────────────

test.beforeAll(async ({ browser }) => {
  await fs.mkdir(AUTH_DIR, { recursive: true });

  // 1. Seed a service the staff member belongs to
  const service = await prisma.service.create({
    data: {
      name: "CT E2E Test Service",
      code: `ct-e2e-svc-${unique}`,
      state: "NSW",
      address: "10 Template Lane",
      suburb: "Testville",
      postcode: "2000",
      status: "active",
    },
  });
  seededServiceId = service.id;

  // 2. Seed admin user (role: admin)
  const admin = await prisma.user.create({
    data: {
      name: "CT E2E Admin",
      email: adminEmail,
      passwordHash: PASSWORD_HASH,
      role: "admin",
    },
  });
  seededAdminId = admin.id;

  // 3. Seed staff user (role: staff, full address for blocking merge tags)
  const staff = await prisma.user.create({
    data: {
      name: "CT E2E Staff",
      email: staffEmail,
      passwordHash: PASSWORD_HASH,
      role: "staff",
      serviceId: service.id,
      addressStreet: "42 Educator Way",
      addressSuburb: "Testville",
      addressState: "NSW",
      addressPostcode: "2000",
    },
  });
  seededStaffId = staff.id;

  // 4. Seed a ContractTemplate with a single paragraph containing staff.firstName
  //    and no manual fields — so step 3 is skipped in the modal.
  const template = await prisma.contractTemplate.create({
    data: {
      name: "E2E Test Template",
      contentJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Dear " },
              {
                type: "mergeTag",
                attrs: { key: "staff.firstName", label: "Staff: First name" },
              },
              { type: "text", text: ", welcome to the team." },
            ],
          },
        ],
      },
      manualFields: [],
      status: "active",
      createdById: admin.id,
    },
  });
  seededTemplateId = template.id;

  // 5. Authenticate the admin and capture the session
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await loginAs(adminPage, adminEmail, ADMIN_SESSION);
  await adminCtx.close();
});

test.afterAll(async () => {
  // Clean up in reverse-dependency order
  await prisma.activityLog
    .deleteMany({ where: { entityType: "EmploymentContract", entityId: issuedContractId } })
    .catch(() => {});
  if (issuedContractId) {
    await prisma.employmentContract.deleteMany({ where: { id: issuedContractId } }).catch(() => {});
  }
  await prisma.contractTemplate.deleteMany({ where: { id: seededTemplateId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [seededAdminId, seededStaffId] } } }).catch(() => {});
  await prisma.service.deleteMany({ where: { id: seededServiceId } }).catch(() => {});
  await fs.unlink(ADMIN_SESSION).catch(() => {});
  await fs.unlink(STAFF_SESSION).catch(() => {});
  await prisma.$disconnect();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Contract-templates — admin issues, staff acknowledges", () => {
  // ── Step A: Templates tab shows seeded template ────────────────────────────

  test("admin sees the seeded template on the Templates tab", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ADMIN_SESSION });
    const page = await ctx.newPage();

    await page.goto("/contracts?tab=templates");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("E2E Test Template")).toBeVisible({ timeout: 10_000 });

    await ctx.close();
  });

  // ── Step B: Issue a contract from the template (3-step modal — details, then review & sign) ──

  test("admin issues a contract from template via the issue modal", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ADMIN_SESSION });
    const page = await ctx.newPage();

    // Navigate to Issued tab
    await page.goto("/contracts");
    await page.waitForLoadState("networkidle");

    // Click "New Contract"
    await page.getByRole("button", { name: /new contract/i }).click();

    // The IssueFromTemplateModal opens at step 1 because templates exist.
    // Confirm the step 1 header is visible.
    await expect(page.getByText(/issue contract from template/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/step 1/i)).toBeVisible();

    // Step 1: select the seeded template. Target by label — positional
    // select locators kept resolving to the /contracts page's own filter
    // selects sitting behind the modal.
    const templateSelect = page.getByLabel("Template", { exact: true });
    await expect(templateSelect).toBeEnabled({ timeout: 30_000 });
    await templateSelect.selectOption({ label: "E2E Test Template" });

    // Step 1: select the seeded staff member by value (user ID is seeded and known)
    const staffSelect = page.getByLabel("Staff member", { exact: true });
    await staffSelect.selectOption({ value: seededStaffId });

    // Click Next
    await page.getByRole("button", { name: /next/i }).click();

    // Step 2 of 3: contract details now come BEFORE the review step — the
    // 2026-07-27 modal redesign merged tag review + signing into one final
    // "Review & sign" step.
    await expect(
      page.getByText(/contract details/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Fill required contract fields
    // Pay rate
    await page.fill('input[type="number"][placeholder*="28"]', "30");
    // Hours per week — the placeholder depends on contract type (part-time,
    // the default, shows "e.g. 20"; other types show "e.g. 38").
    await page.getByPlaceholder(/e\.g\. (20|38)/).fill("38");
    // Start date
    const startDate = page.locator('input[type="date"]').first();
    await startDate.fill("2026-06-01");
    // Position
    await page.fill('input[placeholder*="Educator"]', "Educator");

    await expect(
      page.getByRole("button", { name: /next/i }),
    ).toBeEnabled({ timeout: 15_000 });
    await page.getByRole("button", { name: /next/i }).click();

    // Step 3 of 3: review & sign — resolved-tag checks + final preview +
    // admin signature pad.
    await expect(
      page.getByText(/review & sign|all staff tags resolved|final preview/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // "Sign & Issue" stays disabled until the admin actually signs — draw a
    // stroke on the signature-pad canvas.
    const signatureCanvas = page.locator("canvas").last();
    await signatureCanvas.scrollIntoViewIfNeeded();
    const box = await signatureCanvas.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + 20, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width - 20, box!.y + box!.height / 2, { steps: 8 });
    await page.mouse.up();

    const issueBtn = page.getByRole("button", { name: /sign & issue/i });
    await expect(issueBtn).toBeEnabled({ timeout: 15_000 });
    await issueBtn.click();

    // Modal closes after successful issue
    await expect(page.getByText(/issue contract from template/i)).not.toBeVisible({ timeout: 20_000 });

    // Issued tab refreshes — new contract should appear
    await page.waitForLoadState("networkidle");

    // The contracts table should now include the staff member's name or email
    await expect(
      page.getByText(/CT E2E Staff/i).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await ctx.close();
  });

  // ── Step C: DB assertions ──────────────────────────────────────────────────

  test("issued contract has templateId, templateValues, and documentUrl set", async () => {
    // Find the contract we just issued
    const contract = await prisma.employmentContract.findFirst({
      where: {
        userId: seededStaffId,
        templateId: seededTemplateId,
      },
      orderBy: { createdAt: "desc" },
    });

    expect(contract).not.toBeNull();
    expect(contract!.templateId).toBe(seededTemplateId);
    expect(contract!.templateValues).not.toBeNull();
    // documentUrl is set — either a real Vercel Blob URL or our mock URL
    expect(contract!.documentUrl).toBeTruthy();

    // Capture the ID for the acknowledgement tests and cleanup
    issuedContractId = contract!.id;
  });

  // ── Step D: Staff logs in and acknowledges the contract ───────────────────

  test("staff logs in, sees the contract on My Portal, and acknowledges it", async ({ browser }) => {
    // Ensure the contract was found in the previous test
    expect(issuedContractId).toBeTruthy();

    // Authenticate as staff
    const staffCtx = await browser.newContext();
    const staffPage = await staffCtx.newPage();
    await loginAs(staffPage, staffEmail, STAFF_SESSION);

    // Navigate to My Portal
    await staffPage.goto("/my-portal");
    await staffPage.waitForLoadState("networkidle");
    await expect(staffPage.locator("main")).toBeVisible({ timeout: 15_000 });

    // Acknowledgement is now a read-first flow: the Active Contract card's
    // "Read & acknowledge" CTA opens the inline contract viewer, and the
    // acknowledge action lives inside it (contract-viewer-acknowledge).
    const readBtn = staffPage
      .getByRole("button", { name: /read & acknowledge/i })
      .first();
    await expect(readBtn).toBeVisible({ timeout: 10_000 });
    await readBtn.click();

    const viewer = staffPage.getByTestId("contract-viewer-dialog");
    await expect(viewer).toBeVisible({ timeout: 10_000 });

    // "Sign Contract" switches the footer into signing mode: the staff member
    // draws on a signature pad, then confirms.
    const ackBtn = staffPage.getByTestId("contract-viewer-acknowledge");
    await expect(ackBtn).toBeVisible({ timeout: 10_000 });
    await ackBtn.click();

    const staffPad = viewer.locator("canvas").last();
    await staffPad.scrollIntoViewIfNeeded();
    const padBox = await staffPad.boundingBox();
    expect(padBox).toBeTruthy();
    await staffPage.mouse.move(padBox!.x + 20, padBox!.y + padBox!.height / 2);
    await staffPage.mouse.down();
    await staffPage.mouse.move(
      padBox!.x + padBox!.width - 20,
      padBox!.y + padBox!.height / 2,
      { steps: 8 },
    );
    await staffPage.mouse.up();

    const confirmBtn = staffPage.getByRole("button", { name: /confirm signature/i });
    await expect(confirmBtn).toBeEnabled({ timeout: 10_000 });
    await confirmBtn.click();

    // Signing UI resolves to the acknowledged state.
    await expect(confirmBtn).not.toBeVisible({ timeout: 15_000 });

    // DB assertion: acknowledgedByStaff is now true
    const updated = await prisma.employmentContract.findUnique({
      where: { id: issuedContractId },
      select: { acknowledgedByStaff: true, acknowledgedAt: true },
    });
    expect(updated?.acknowledgedByStaff).toBe(true);
    expect(updated?.acknowledgedAt).not.toBeNull();

    await staffCtx.close();
  });
});
