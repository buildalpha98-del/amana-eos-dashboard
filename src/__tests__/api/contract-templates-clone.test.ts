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
import { POST } from "@/app/api/contract-templates/[id]/clone/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const SOURCE_DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Clause 1" }] }] };
const SOURCE_MANUAL_FIELDS = [{ key: "position", label: "Position", type: "text", required: true }];

const SOURCE_TEMPLATE = {
  id: "tpl-src",
  name: "Permanent Contract",
  description: "Base permanent template",
  status: "active",
  contentJson: SOURCE_DOC,
  manualFields: SOURCE_MANUAL_FIELDS,
  createdById: "user-1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const PARAMS = { params: Promise.resolve({ id: "tpl-src" }) };
const MISSING_PARAMS = { params: Promise.resolve({ id: "missing-id" }) };

describe("POST /api/contract-templates/[id]/clone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("POST", "/api/contract-templates/tpl-src/clone");
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(401);
  });

  it("returns 403 when role is member", async () => {
    mockSession({ id: "user-1", name: "Test", role: "member" });

    const req = createRequest("POST", "/api/contract-templates/tpl-src/clone");
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(403);
  });

  it("returns 404 when source template not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(null);

    const req = createRequest("POST", "/api/contract-templates/missing-id/clone");
    const res = await POST(req, MISSING_PARAMS);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Template not found");
  });

  it("happy path: returns 201, new template has (copy) suffix, distinct id, copied content/manualFields", async () => {
    mockSession({ id: "user-2", name: "Admin", role: "admin" });

    prismaMock.contractTemplate.findUnique.mockResolvedValue(SOURCE_TEMPLATE);

    const cloned = {
      id: "tpl-clone",
      name: "Permanent Contract (copy)",
      description: SOURCE_TEMPLATE.description,
      status: "active",
      contentJson: SOURCE_DOC,
      manualFields: SOURCE_MANUAL_FIELDS,
      createdById: "user-2",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaMock.contractTemplate.create.mockResolvedValue(cloned);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/contract-templates/tpl-src/clone");
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(201);
    const body = await res.json();

    // Has (copy) suffix
    expect(body.name).toBe("Permanent Contract (copy)");
    // Distinct id from source
    expect(body.id).not.toBe("tpl-src");
    expect(body.id).toBe("tpl-clone");
    // Copied content
    expect(body.contentJson).toEqual(SOURCE_DOC);
    expect(body.manualFields).toEqual(SOURCE_MANUAL_FIELDS);

    // Verify create was called with (copy) suffix and status: "active"
    expect(prismaMock.contractTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Permanent Contract (copy)",
          status: "active",
          createdById: "user-2",
        }),
      })
    );
  });

  it("ActivityLog has details.sourceId equal to the original template id", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });

    prismaMock.contractTemplate.findUnique.mockResolvedValue(SOURCE_TEMPLATE);

    const cloned = {
      id: "tpl-clone",
      name: "Permanent Contract (copy)",
      description: SOURCE_TEMPLATE.description,
      status: "active",
      contentJson: SOURCE_DOC,
      manualFields: SOURCE_MANUAL_FIELDS,
      createdById: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaMock.contractTemplate.create.mockResolvedValue(cloned);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/contract-templates/tpl-src/clone");
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(201);
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "clone",
          entityType: "ContractTemplate",
          details: expect.objectContaining({ sourceId: "tpl-src" }),
        }),
      })
    );
  });
});
