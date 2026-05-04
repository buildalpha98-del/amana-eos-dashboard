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
import { GET, PATCH, DELETE } from "@/app/api/contract-templates/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const VALID_DOC = { type: "doc", content: [{ type: "paragraph" }] };
const MOCK_TEMPLATE = {
  id: "tpl-1",
  name: "Casual Contract",
  description: "Template for casuals",
  status: "active",
  contentJson: VALID_DOC,
  manualFields: [],
  createdById: "user-1",
  createdBy: { id: "user-1", name: "Owner" },
  updatedBy: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const PARAMS = { params: Promise.resolve({ id: "tpl-1" }) };
const MISSING_PARAMS = { params: Promise.resolve({ id: "missing-id" }) };

describe("GET /api/contract-templates/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("GET", "/api/contract-templates/tpl-1");
    const res = await GET(req, PARAMS);

    expect(res.status).toBe(401);
  });

  it("returns 403 when role is member", async () => {
    mockSession({ id: "user-1", name: "Test", role: "member" });

    const req = createRequest("GET", "/api/contract-templates/tpl-1");
    const res = await GET(req, PARAMS);

    expect(res.status).toBe(403);
  });

  it("returns 404 when template not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(null);

    const req = createRequest("GET", "/api/contract-templates/missing-id");
    const res = await GET(req, MISSING_PARAMS);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Template not found");
  });

  it("happy path returns template with createdBy/updatedBy", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(MOCK_TEMPLATE);

    const req = createRequest("GET", "/api/contract-templates/tpl-1");
    const res = await GET(req, PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("tpl-1");
    expect(body.createdBy).toEqual({ id: "user-1", name: "Owner" });
    expect(body.updatedBy).toBeNull();
  });
});

describe("PATCH /api/contract-templates/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("PATCH", "/api/contract-templates/tpl-1", { body: { name: "New Name" } });
    const res = await PATCH(req, PARAMS);

    expect(res.status).toBe(401);
  });

  it("returns 403 when role is staff", async () => {
    mockSession({ id: "user-1", name: "Test", role: "staff" });

    const req = createRequest("PATCH", "/api/contract-templates/tpl-1", { body: { name: "New Name" } });
    const res = await PATCH(req, PARAMS);

    expect(res.status).toBe(403);
  });

  it("returns 404 when template not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/contract-templates/missing-id", { body: { name: "New Name" } });
    const res = await PATCH(req, MISSING_PARAMS);

    expect(res.status).toBe(404);
  });

  it("returns 400 on bad body (name too short after minLength)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue({ status: "active" });

    const req = createRequest("PATCH", "/api/contract-templates/tpl-1", { body: { name: "" } });
    const res = await PATCH(req, PARAMS);

    expect(res.status).toBe(400);
  });

  it("happy path: partial update sets updatedById; ActivityLog action is 'update'", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    prismaMock.contractTemplate.findUnique.mockResolvedValue({ status: "active" });
    const updated = { ...MOCK_TEMPLATE, name: "New Name", updatedById: "user-1" };
    prismaMock.contractTemplate.update.mockResolvedValue(updated);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/contract-templates/tpl-1", { body: { name: "New Name" } });
    const res = await PATCH(req, PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("New Name");
    expect(prismaMock.contractTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ updatedById: "user-1" }),
      })
    );
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "update" }),
      })
    );
  });

  it("status: 'disabled' (when current is 'active') → ActivityLog action is 'disable'", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    prismaMock.contractTemplate.findUnique.mockResolvedValue({ status: "active" });
    const updated = { ...MOCK_TEMPLATE, status: "disabled" };
    prismaMock.contractTemplate.update.mockResolvedValue(updated);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/contract-templates/tpl-1", { body: { status: "disabled" } });
    const res = await PATCH(req, PARAMS);

    expect(res.status).toBe(200);
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "disable" }),
      })
    );
  });

  it("status: 'active' (when current is 'disabled') → ActivityLog action is 'enable'", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    prismaMock.contractTemplate.findUnique.mockResolvedValue({ status: "disabled" });
    const updated = { ...MOCK_TEMPLATE, status: "active" };
    prismaMock.contractTemplate.update.mockResolvedValue(updated);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/contract-templates/tpl-1", { body: { status: "active" } });
    const res = await PATCH(req, PARAMS);

    expect(res.status).toBe(200);
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "enable" }),
      })
    );
  });
});

describe("DELETE /api/contract-templates/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("DELETE", "/api/contract-templates/tpl-1");
    const res = await DELETE(req, PARAMS);

    expect(res.status).toBe(401);
  });

  it("returns 403 when role is member", async () => {
    mockSession({ id: "user-1", name: "Test", role: "member" });

    const req = createRequest("DELETE", "/api/contract-templates/tpl-1");
    const res = await DELETE(req, PARAMS);

    expect(res.status).toBe(403);
  });

  it("returns 404 when template not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.contractTemplate.findUnique.mockResolvedValue(null);

    const req = createRequest("DELETE", "/api/contract-templates/missing-id");
    const res = await DELETE(req, MISSING_PARAMS);

    expect(res.status).toBe(404);
  });

  it("happy path: deletes row + logs activity, returns { ok: true }", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    prismaMock.contractTemplate.findUnique.mockResolvedValue({ id: "tpl-1", name: "Casual Contract" });
    prismaMock.employmentContract.count.mockResolvedValue(0);
    prismaMock.contractTemplate.delete.mockResolvedValue({});
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("DELETE", "/api/contract-templates/tpl-1");
    const res = await DELETE(req, PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(prismaMock.contractTemplate.delete).toHaveBeenCalledWith({ where: { id: "tpl-1" } });
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "delete", entityType: "ContractTemplate" }),
      })
    );
  });

  it("returns 409 when an EmploymentContract still references the template", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    prismaMock.contractTemplate.findUnique.mockResolvedValue({ id: "tpl-1", name: "Casual Contract" });
    prismaMock.employmentContract.count.mockResolvedValue(3);

    const req = createRequest("DELETE", "/api/contract-templates/tpl-1");
    const res = await DELETE(req, PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/3 issued contract/i);
  });
});
