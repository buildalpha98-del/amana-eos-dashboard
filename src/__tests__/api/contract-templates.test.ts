import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })
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

// Import after mocks
import { GET, POST } from "@/app/api/contract-templates/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const VALID_DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] };
const VALID_MANUAL_FIELDS: unknown[] = [];

describe("GET /api/contract-templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("GET", "/api/contract-templates");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when role is member", async () => {
    mockSession({ id: "user-1", name: "Test", role: "member" });

    const req = createRequest("GET", "/api/contract-templates");
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it("returns 403 when role is staff", async () => {
    mockSession({ id: "user-1", name: "Test", role: "staff" });

    const req = createRequest("GET", "/api/contract-templates");
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it("happy path returns array of templates", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });

    const mockTemplates = [
      {
        id: "tpl-1",
        name: "Casual Contract",
        description: "Template for casuals",
        status: "active",
        contentJson: VALID_DOC,
        manualFields: [],
        createdById: "user-1",
        createdBy: { id: "user-1", name: "Test" },
        updatedBy: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
    ];
    prismaMock.contractTemplate.findMany.mockResolvedValue(mockTemplates);

    const req = createRequest("GET", "/api/contract-templates");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Casual Contract");
  });

  it("?status=active filter passes through to Prisma", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.contractTemplate.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/contract-templates?status=active");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prismaMock.contractTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "active" }),
      })
    );
  });

  it("?search=foo filter passes through to Prisma with contains + insensitive mode", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.contractTemplate.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/contract-templates?search=foo");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prismaMock.contractTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: { contains: "foo", mode: "insensitive" },
        }),
      })
    );
  });
});

describe("POST /api/contract-templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("POST", "/api/contract-templates", {
      body: { name: "Test", contentJson: VALID_DOC, manualFields: VALID_MANUAL_FIELDS },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("returns 403 when role is member", async () => {
    mockSession({ id: "user-1", name: "Test", role: "member" });

    const req = createRequest("POST", "/api/contract-templates", {
      body: { name: "Test", contentJson: VALID_DOC, manualFields: VALID_MANUAL_FIELDS },
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("returns 400 when body fails Zod (missing name)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });

    const req = createRequest("POST", "/api/contract-templates", {
      body: { contentJson: VALID_DOC, manualFields: VALID_MANUAL_FIELDS },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("happy path: creates row + ActivityLog inside $transaction, returns 201", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const created = {
      id: "tpl-new",
      name: "Permanent Contract",
      description: null,
      status: "active",
      contentJson: VALID_DOC,
      manualFields: [],
      createdById: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaMock.contractTemplate.create.mockResolvedValue(created);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/contract-templates", {
      body: { name: "Permanent Contract", contentJson: VALID_DOC, manualFields: VALID_MANUAL_FIELDS },
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("tpl-new");
    expect(prismaMock.contractTemplate.create).toHaveBeenCalled();
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "create",
          entityType: "ContractTemplate",
        }),
      })
    );
  });

  it("manualFields with key collision → 400 (Zod rejection)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    // Two fields with the same key = collision
    const duplicateManualFields = [
      { key: "position", label: "Position", type: "text", required: true },
      { key: "position", label: "Position Again", type: "text", required: false },
    ];

    const req = createRequest("POST", "/api/contract-templates", {
      body: { name: "Test", contentJson: VALID_DOC, manualFields: duplicateManualFields },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/duplicate/i);
  });
});
