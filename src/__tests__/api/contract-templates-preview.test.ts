import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 19, resetIn: 60000 })
  ),
}));

// Mock logger
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

// Mock resolveTemplateData so tests don't need a DB
const mockResolveTemplateData = vi.fn();
vi.mock("@/lib/contract-templates/resolve-data", () => ({
  resolveTemplateData: (...args: unknown[]) => mockResolveTemplateData(...args),
}));

// Import after mocks
import { POST } from "@/app/api/contract-templates/[id]/preview/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const SIMPLE_DOC = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Hello " }, { type: "mergeTag", attrs: { key: "staff.firstName" } }],
    },
  ],
};

const MOCK_TEMPLATE = {
  id: "tpl-1",
  name: "Test Template",
  description: null,
  status: "active",
  contentJson: SIMPLE_DOC,
  manualFields: [],
  createdById: "user-1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const PARAMS = { params: Promise.resolve({ id: "tpl-1" }) };
const MISSING_PARAMS = { params: Promise.resolve({ id: "missing-id" }) };

const VALID_CONTRACT_META = {
  contractType: "ct_permanent",
  payRate: 35.5,
  startDate: "2026-01-01",
  position: "Educator",
};

describe("POST /api/contract-templates/[id]/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    mockResolveTemplateData.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("POST", "/api/contract-templates/tpl-1/preview", { body: {} });
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(401);
  });

  it("returns 403 when role is member", async () => {
    mockSession({ id: "user-1", name: "Test", role: "member" });

    const req = createRequest("POST", "/api/contract-templates/tpl-1/preview", { body: {} });
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(403);
  });

  it("returns 404 when template not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(null);

    const req = createRequest("POST", "/api/contract-templates/missing-id/preview", { body: {} });
    const res = await POST(req, MISSING_PARAMS);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Template not found");
  });

  it("without userId: uses sample data (html contains 'Sarah' from SAMPLE_RESOLVED_AUTO)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);

    const req = createRequest("POST", "/api/contract-templates/tpl-1/preview", { body: {} });
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("html");
    expect(body).toHaveProperty("missingTags");
    // Sample data has staff.firstName = "Sarah"
    expect(body.html).toContain("Sarah");
    // resolveTemplateData should NOT have been called
    expect(mockResolveTemplateData).not.toHaveBeenCalled();
  });

  it("with userId + contractMeta: calls resolveTemplateData with the userId", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);

    mockResolveTemplateData.mockResolvedValue({
      resolved: {
        "staff.firstName": "James",
        "staff.lastName": "Smith",
        "staff.fullName": "James Smith",
        "staff.email": "james@test.com",
        "staff.phone": "",
        "staff.address": "",
        "staff.city": "",
        "staff.state": "",
        "staff.postcode": "",
        "service.name": "Test Centre",
        "service.address": "",
        "service.entityName": "Amana OSHC Pty Ltd",
        "contract.startDate": "1 January 2026",
        "contract.endDate": "",
        "contract.payRate": "$35.50",
        "contract.hoursPerWeek": "",
        "contract.position": "Educator",
        "contract.contractType": "Permanent",
        "contract.awardLevel": "",
        "manager.firstName": "",
        "manager.lastName": "",
        "manager.fullName": "",
        "manager.title": "",
        today: "01/01/2026",
        letterDate: "1 January 2026",
      },
      missingBlocking: [],
    });

    const req = createRequest("POST", "/api/contract-templates/tpl-1/preview", {
      body: {
        userId: "user-target",
        contractMeta: VALID_CONTRACT_META,
      },
    });
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(200);
    // resolveTemplateData was called with the userId
    expect(mockResolveTemplateData).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-target" })
    );
    const body = await res.json();
    expect(body.html).toContain("James");
  });

  it("manualValues override on top of resolved data", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);

    // No userId → sample data is used (staff.firstName = "Sarah")
    // But manualValues overrides staff.firstName to "Override"
    const req = createRequest("POST", "/api/contract-templates/tpl-1/preview", {
      body: {
        manualValues: { "staff.firstName": "Override" },
      },
    });
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.html).toContain("Override");
    expect(body.html).not.toContain("Sarah");
  });

  it("returns { html, missingTags } shape with no PDF generation", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });

    // Template with a missing merge tag
    const docWithMissingTag = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "mergeTag", attrs: { key: "nonexistent.tag" } }],
        },
      ],
    };
    prismaMock.contractTemplate.findUnique.mockResolvedValue({
      ...MOCK_TEMPLATE,
      contentJson: docWithMissingTag,
    });

    const req = createRequest("POST", "/api/contract-templates/tpl-1/preview", { body: {} });
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("html");
    expect(body).toHaveProperty("missingTags");
    expect(Array.isArray(body.missingTags)).toBe(true);
    // The missing tag should appear in missingTags
    expect(body.missingTags).toContain("nonexistent.tag");
    // No pdf property
    expect(body).not.toHaveProperty("pdf");
  });
});
