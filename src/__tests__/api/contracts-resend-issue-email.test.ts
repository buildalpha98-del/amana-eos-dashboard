import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
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

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "msg-456" })),
}));

// ── Import after all mocks ────────────────────────────────────────────────────
import { POST } from "@/app/api/contracts/[id]/resend-issue-email/route";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { sendEmail } from "@/lib/email";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_CONTRACT_WITH_DOC = {
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
  templateValues: null,
  signedAt: null,
  acknowledgedByStaff: false,
  acknowledgedAt: null,
  notes: null,
  previousContractId: null,
  createdAt: new Date("2026-05-04"),
  updatedAt: new Date("2026-05-04"),
};

const MOCK_CONTRACT_NO_DOC = {
  ...MOCK_CONTRACT_WITH_DOC,
  id: "contract-no-doc",
  documentUrl: null,
};

const MOCK_STAFF = {
  email: "jane@test.com",
  name: "Jane Smith",
};

const MOCK_TEMPLATE = {
  name: "Casual Contract",
};

const PARAMS = { params: Promise.resolve({ id: "contract-1" }) };
const NO_DOC_PARAMS = { params: Promise.resolve({ id: "contract-no-doc" }) };
const MISSING_PARAMS = { params: Promise.resolve({ id: "missing-contract" }) };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/contracts/[id]/resend-issue-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    // Default: active user check
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    // Default: contract with document
    prismaMock.employmentContract.findUnique.mockResolvedValue(MOCK_CONTRACT_WITH_DOC);
    // Default: staff lookup
    prismaMock.user.findUniqueOrThrow.mockResolvedValue(MOCK_STAFF);
    // Default: template lookup
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);
    // Default: activity log
    prismaMock.activityLog.create.mockResolvedValue({ id: "log-1" });
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("POST", "/api/contracts/contract-1/resend-issue-email");
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when role is member", async () => {
    mockSession({ id: "user-1", name: "Test", role: "member" });

    const req = createRequest("POST", "/api/contracts/contract-1/resend-issue-email");
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(403);
  });

  it("returns 403 when role is staff", async () => {
    mockSession({ id: "user-1", name: "Test", role: "staff" });

    const req = createRequest("POST", "/api/contracts/contract-1/resend-issue-email");
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(403);
  });

  // ── Not found ───────────────────────────────────────────────────────────────

  it("returns 404 when contract not found", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.employmentContract.findUnique.mockResolvedValue(null);

    const req = createRequest("POST", "/api/contracts/missing-contract/resend-issue-email");
    const res = await POST(req, MISSING_PARAMS);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Contract not found");
  });

  // ── No document ──────────────────────────────────────────────────────────────

  it("returns 400 when contract has no documentUrl", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.employmentContract.findUnique.mockResolvedValue(MOCK_CONTRACT_NO_DOC);

    const req = createRequest("POST", "/api/contracts/contract-no-doc/resend-issue-email");
    const res = await POST(req, NO_DOC_PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("no issued document");
  });

  // ── Happy path ───────────────────────────────────────────────────────────────

  it("happy path: sends email, logs activity, returns ok: true", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });

    const req = createRequest("POST", "/api/contracts/contract-1/resend-issue-email");
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Email was sent to the staff member
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@test.com" }),
    );

    // Activity log was created
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "resend_issue_email",
          entityType: "EmploymentContract",
          entityId: "contract-1",
        }),
      }),
    );
  });

  it("happy path without templateId: falls back to default template name in email", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      ...MOCK_CONTRACT_WITH_DOC,
      templateId: null,
    });

    const req = createRequest("POST", "/api/contracts/contract-1/resend-issue-email");
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(200);
    // contractTemplate.findUnique should NOT have been called when templateId is null
    expect(prismaMock.contractTemplate.findUnique).not.toHaveBeenCalled();

    // Email was still sent
    expect(sendEmail).toHaveBeenCalled();
  });
});
