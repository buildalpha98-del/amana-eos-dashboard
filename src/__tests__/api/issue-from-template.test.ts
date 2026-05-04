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
    // Default contract create mock
    prismaMock.employmentContract.create.mockResolvedValue(MOCK_CONTRACT);
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

  it("returns 400 when resolveTemplateData returns missingBlocking fields", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);
    mockResolveTemplateData.mockResolvedValue({
      resolved: {},
      missingBlocking: ["staff.address", "staff.phone"],
    });

    const req = createRequest("POST", "/api/contracts/issue-from-template", { body: VALID_BODY });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("staff.address");
    expect(body.error).toContain("staff.phone");
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

    // employmentContract.create called with correct shape
    expect(prismaMock.employmentContract.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "active",
          templateId: "tpl-1",
          documentUrl: "https://blob.test/contract-xyz.pdf",
          documentId: null,
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

  // ── PDF render failure ────────────────────────────────────────────────────────

  it("returns 500 and does NOT create a DB row when PDF render throws", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);
    (renderContractPdf as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Chromium launch failed"),
    );

    const req = createRequest("POST", "/api/contracts/issue-from-template", { body: VALID_BODY });
    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(prismaMock.employmentContract.create).not.toHaveBeenCalled();
  });

  // ── Upload failure ─────────────────────────────────────────────────────────

  it("returns 500 and does NOT create a DB row when uploadFile throws", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);
    (uploadFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Blob storage unavailable"),
    );

    const req = createRequest("POST", "/api/contracts/issue-from-template", { body: VALID_BODY });
    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(prismaMock.employmentContract.create).not.toHaveBeenCalled();
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
