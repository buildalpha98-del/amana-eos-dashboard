import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 9, resetIn: 60000 }),
  ),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/pdf/render-contract", () => ({
  renderContractPdf: vi.fn(async () => Buffer.from("PDF")),
}));

vi.mock("@/lib/storage", () => ({
  uploadFile: vi.fn(async () => ({ url: "https://blob.test/contract-xyz.pdf", size: 4 })),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "msg-123" })),
}));

// Mock resolveTemplateData so tests control resolved + missingBlocking directly
const mockResolveTemplateData = vi.fn();
vi.mock("@/lib/contract-templates/resolve-data", () => ({
  resolveTemplateData: (...args: unknown[]) => mockResolveTemplateData(...args),
}));

// ── Import after all mocks ────────────────────────────────────────────────────
import { POST } from "@/app/api/contracts/issue-from-template/route";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { renderContractPdf } from "@/lib/pdf/render-contract";
import { uploadFile } from "@/lib/storage";
import { sendEmail } from "@/lib/email";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SIMPLE_DOC = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Hello " }],
    },
  ],
};

const MOCK_TEMPLATE = {
  id: "tpl-1",
  name: "Casual Contract",
  description: null,
  status: "active",
  contentJson: SIMPLE_DOC,
  manualFields: [],
  createdById: "user-1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const MOCK_CONTRACT = {
  id: "contract-1",
  userId: "staff-1",
  contractType: "ct_casual",
  awardLevel: null,
  awardLevelCustom: null,
  payRate: 35.5,
  hoursPerWeek: null,
  startDate: new Date("2026-06-01"),
  endDate: null,
  status: "active",
  documentUrl: "https://blob.test/contract-xyz.pdf",
  documentId: null,
  templateId: "tpl-1",
  templateValues: { auto: { "staff.firstName": "Jane" }, manual: { probation: "3 months" } },
  signedAt: null,
  acknowledgedByStaff: false,
  acknowledgedAt: null,
  notes: null,
  previousContractId: null,
  createdAt: new Date("2026-05-04"),
  updatedAt: new Date("2026-05-04"),
};

const MOCK_STAFF = {
  email: "jane@test.com",
  name: "Jane Smith",
};

const VALID_BODY = {
  templateId: "tpl-1",
  userId: "staff-1",
  contractMeta: {
    contractType: "ct_casual",
    payRate: 35.5,
    startDate: "2026-06-01",
    position: "Educator",
  },
  manualValues: { probation: "3 months" },
};

const DEFAULT_RESOLVED = {
  "staff.firstName": "Jane",
  "staff.lastName": "Smith",
  "staff.fullName": "Jane Smith",
  "staff.email": "jane@test.com",
  "staff.phone": "",
  "staff.address": "123 Main St",
  "staff.city": "Sydney",
  "staff.state": "NSW",
  "staff.postcode": "2000",
  "service.name": "Test Centre",
  "service.address": "",
  "service.entityName": "Amana OSHC Pty Ltd",
  "contract.startDate": "1 June 2026",
  "contract.endDate": "",
  "contract.payRate": "$35.50",
  "contract.hoursPerWeek": "",
  "contract.position": "Educator",
  "contract.contractType": "Casual",
  "contract.awardLevel": "",
  "manager.firstName": "Daniel",
  "manager.lastName": "Smith",
  "manager.fullName": "Daniel Smith",
  "manager.title": "Director",
  today: "4/5/2026",
  letterDate: "4 May 2026",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/contracts/issue-from-template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    // Default: active user
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    // Default resolveTemplateData: all tags resolved, nothing blocking
    mockResolveTemplateData.mockResolvedValue({
      resolved: DEFAULT_RESOLVED,
      missingBlocking: [],
    });
    // Default prisma $transaction: runs the callback and returns its result
    // (prisma-mock already does this — `$transaction` passes the proxy client to the callback)
    // Draft-first flow (2026-08-07): create makes the contract_draft row,
    // update finalizes it to active (and handles supersede flips).
    prismaMock.employmentContract.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...MOCK_CONTRACT, ...args.data, id: "contract-1" }),
    );
    prismaMock.employmentContract.update.mockImplementation(
      (args: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...MOCK_CONTRACT, id: args.where.id, ...args.data }),
    );
    prismaMock.employmentContract.findFirst.mockResolvedValue(null);
    prismaMock.activityLog.create.mockResolvedValue({ id: "log-1" });
    // Default user lookup for email
    prismaMock.user.findUniqueOrThrow.mockResolvedValue(MOCK_STAFF);
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("POST", "/api/contracts/issue-from-template", { body: VALID_BODY });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when role is member", async () => {
    mockSession({ id: "user-1", name: "Test", role: "member" });

    const req = createRequest("POST", "/api/contracts/issue-from-template", { body: VALID_BODY });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("returns 403 when role is staff", async () => {
    mockSession({ id: "user-1", name: "Test", role: "staff" });

    const req = createRequest("POST", "/api/contracts/issue-from-template", { body: VALID_BODY });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it("returns 400 when body is missing templateId", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });

    const req = createRequest("POST", "/api/contracts/issue-from-template", {
      body: { userId: "staff-1", contractMeta: { contractType: "ct_casual", payRate: 35, startDate: "2026-06-01", position: "Edu" }, manualValues: {} },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/templateId|invalid/i);
  });

  it("returns 400 when body is missing required contractMeta.position", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });

    const req = createRequest("POST", "/api/contracts/issue-from-template", {
      body: {
        templateId: "tpl-1",
        userId: "staff-1",
        contractMeta: { contractType: "ct_casual", payRate: 35, startDate: "2026-06-01" /* no position */ },
        manualValues: {},
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  // ── Template lookup errors ───────────────────────────────────────────────────

  it("returns 404 when template not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(null);

    const req = createRequest("POST", "/api/contracts/issue-from-template", { body: VALID_BODY });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Template not found");
  });

  it("returns 400 when template is disabled", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue({ ...MOCK_TEMPLATE, status: "disabled" });

    const req = createRequest("POST", "/api/contracts/issue-from-template", { body: VALID_BODY });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Template is disabled");
  });

  // ── Resolution / render errors ───────────────────────────────────────────────

  it("returns 400 when the template references a missingBlocking field", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    // The template must actually reference the tag — the route only blocks
    // on missing staff fields the document uses (see the filter test below).
    prismaMock.contractTemplate.findUnique.mockResolvedValue({
      ...MOCK_TEMPLATE,
      contentJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Address: " },
              { type: "mergeTag", attrs: { key: "staff.address" } },
            ],
          },
        ],
      },
    });
    mockResolveTemplateData.mockResolvedValue({
      resolved: {},
      missingBlocking: ["staff.address", "staff.phone"],
    });

    const req = createRequest("POST", "/api/contracts/issue-from-template", { body: VALID_BODY });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("staff.address");
    // staff.phone is missing on the profile but unused by this template,
    // so it must NOT be reported as a blocker.
    expect(body.error).not.toContain("staff.phone");
  });

  it("ignores missingBlocking fields the template never references", async () => {
    // 2026-07-27 regression guard: issuing the Casual Educator template
    // failed with "staff.address missing" even though that template has no
    // address tag and the wizard offered no way to supply one. The route
    // now intersects missingBlocking with the tags actually present in the
    // document body.
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE); // SIMPLE_DOC — no merge tags
    mockResolveTemplateData.mockResolvedValue({
      resolved: {},
      missingBlocking: ["staff.address", "staff.phone"],
    });

    const req = createRequest("POST", "/api/contracts/issue-from-template", { body: VALID_BODY });
    const res = await POST(req);

    expect(res.status).toBe(201);
  });

  // ── Happy path ───────────────────────────────────────────────────────────────

  it("happy path: creates contract, logs activity, sends email, returns 201 with emailFailed: false", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);

    const req = createRequest("POST", "/api/contracts/issue-from-template", { body: VALID_BODY });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const resBody = await res.json();
    expect(resBody.emailFailed).toBe(false);
    expect(resBody.id).toBe("contract-1");
    expect(resBody.status).toBe("active");

    // Draft-first (2026-08-07): the row is created as a contract_draft
    // BEFORE the slow PDF render, so a mid-request crash leaves evidence.
    expect(prismaMock.employmentContract.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "contract_draft",
          templateId: "tpl-1",
          documentUrl: null,
          documentId: null,
        }),
      }),
    );
    expect(
      (prismaMock.employmentContract.create as ReturnType<typeof vi.fn>).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      (renderContractPdf as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    );

    // ...then finalized to active with the uploaded document.
    expect(prismaMock.employmentContract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "contract-1" },
        data: expect.objectContaining({
          status: "active",
          documentUrl: "https://blob.test/contract-xyz.pdf",
        }),
      }),
    );

    // templateValues has correct top-level shape
    const createCall = (prismaMock.employmentContract.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.templateValues).toEqual(
      expect.objectContaining({
        auto: expect.objectContaining({ "staff.firstName": "Jane" }),
        manual: expect.objectContaining({ probation: "3 months" }),
      }),
    );
    // classification (Task 10.3) is optional — omitted here, stored null.
    expect(createCall.data.classification).toBeNull();

    // activityLog.create called with correct fields
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "issue_from_template",
          entityType: "EmploymentContract",
          details: expect.objectContaining({
            templateId: "tpl-1",
            templateName: "Casual Contract",
          }),
        }),
      }),
    );

    // Both create calls were made (inside the transaction callback)
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();

    // sendEmail called with the staff member's email
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@test.com" }),
    );
  });

  // Task 10.3: optional classification flows through to the draft row.
  it("stores contractMeta.classification on the created contract when provided", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);

    const req = createRequest("POST", "/api/contracts/issue-from-template", {
      body: {
        ...VALID_BODY,
        contractMeta: {
          ...VALID_BODY.contractMeta,
          classification: "Children's Services Employee Level 3.1",
        },
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const createCall = (
      prismaMock.employmentContract.create as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(createCall.data.classification).toBe(
      "Children's Services Employee Level 3.1",
    );
  });

  it("400 when contractMeta.classification exceeds 200 characters", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);

    const req = createRequest("POST", "/api/contracts/issue-from-template", {
      body: {
        ...VALID_BODY,
        contractMeta: {
          ...VALID_BODY.contractMeta,
          classification: "x".repeat(201),
        },
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── PDF render failure ────────────────────────────────────────────────────────
  //
  // 2026-08-07 hardening: these used to assert "no DB row on failure".
  // That silence is exactly what burned us — a timed-out issue left NO
  // trace and the admin believed the contract had been sent (real
  // incident, reported 2026-08-07). Now a failure AFTER the draft row is
  // created must LEAVE the draft as visible evidence and point at it.

  it("PDF render failure: 502 pointing at the surviving draft; no finalize/log/email", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);
    (renderContractPdf as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Chromium launch failed"),
    );

    const req = createRequest("POST", "/api/contracts/issue-from-template", { body: VALID_BODY });
    const res = await POST(req);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("saved as a draft");
    expect(body.details?.contractId).toBe("contract-1");

    expect(prismaMock.employmentContract.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.employmentContract.update).not.toHaveBeenCalled();
    expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  // ── Upload failure ─────────────────────────────────────────────────────────

  it("upload failure: 502 pointing at the surviving draft; no finalize/log/email", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);
    (uploadFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Blob storage unavailable"),
    );

    const req = createRequest("POST", "/api/contracts/issue-from-template", { body: VALID_BODY });
    const res = await POST(req);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.details?.contractId).toBe("contract-1");
    expect(prismaMock.employmentContract.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.employmentContract.update).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  // ── Supersede ──────────────────────────────────────────────────────────────

  it("supersede: flips the existing contract and links previousContractId on the new one", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);
    prismaMock.employmentContract.findFirst.mockResolvedValue({ id: "old-contract" });

    const req = createRequest("POST", "/api/contracts/issue-from-template", {
      body: { ...VALID_BODY, supersedeExisting: true },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const createCall = (prismaMock.employmentContract.create as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(createCall.data.previousContractId).toBe("old-contract");

    const updates = (prismaMock.employmentContract.update as ReturnType<typeof vi.fn>)
      .mock.calls as Array<[{ where: { id: string }; data: { status: string } }]>;
    const superseded = updates.find((c) => c[0].where.id === "old-contract");
    const finalized = updates.find((c) => c[0].where.id === "contract-1");
    expect(superseded?.[0].data.status).toBe("superseded");
    expect(finalized?.[0].data.status).toBe("active");
  });

  // ── Email failure ────────────────────────────────────────────────────────────

  it("contract is still created and emailFailed: true when sendEmail throws", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);
    (sendEmail as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Resend API timeout"),
    );

    const req = createRequest("POST", "/api/contracts/issue-from-template", { body: VALID_BODY });
    const res = await POST(req);

    // Contract was still created
    expect(prismaMock.employmentContract.create).toHaveBeenCalled();

    // logger.error was called to record the failure
    expect(logger.error).toHaveBeenCalledWith(
      "issue-from-template: email send failed",
      expect.objectContaining({ contractId: "contract-1" }),
    );

    // Response is still 201 but flags the email failure
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.emailFailed).toBe(true);
  });
});
