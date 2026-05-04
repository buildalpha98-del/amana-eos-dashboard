import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
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

import {
  GET as ListGET,
  POST as CreatePOST,
} from "@/app/api/roster/shift-templates/route";
import { DELETE as DeleteRoute } from "@/app/api/roster/shift-templates/[id]/route";

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    serviceId: "svc-1",
    label: "ASC educator 3-6pm",
    sessionType: "asc",
    shiftStart: "15:00",
    shiftEnd: "18:00",
    role: "Educator",
    createdById: "admin-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation((args: unknown) => {
    const { select } = args as { select?: Record<string, boolean> };
    if (select && "active" in select) return Promise.resolve({ active: true });
    return Promise.resolve({ active: true });
  });
}

describe("GET /api/roster/shift-templates", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await ListGET(
      createRequest("GET", "/api/roster/shift-templates?serviceId=svc-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when serviceId is missing", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "admin" });
    const res = await ListGET(
      createRequest("GET", "/api/roster/shift-templates"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for member at a different service", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "member", serviceId: "svc-other" });
    const res = await ListGET(
      createRequest("GET", "/api/roster/shift-templates?serviceId=svc-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns templates for a member at the same service", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "member", serviceId: "svc-1" });
    prismaMock.shiftTemplate.findMany.mockResolvedValue([makeTemplate()]);
    const res = await ListGET(
      createRequest("GET", "/api/roster/shift-templates?serviceId=svc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates).toHaveLength(1);
    expect(body.templates[0].label).toBe("ASC educator 3-6pm");
  });

  it("admin can read templates at any service", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.shiftTemplate.findMany.mockResolvedValue([
      makeTemplate({ serviceId: "svc-other" }),
    ]);
    const res = await ListGET(
      createRequest("GET", "/api/roster/shift-templates?serviceId=svc-other"),
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/roster/shift-templates", () => {
  beforeEach(resetCommon);

  const validBody = {
    serviceId: "svc-1",
    label: "ASC educator 3-6pm",
    sessionType: "asc" as const,
    shiftStart: "15:00",
    shiftEnd: "18:00",
    role: "Educator",
  };

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await CreatePOST(
      createRequest("POST", "/api/roster/shift-templates", { body: validBody }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body (shiftEnd before shiftStart)", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "admin" });
    const res = await CreatePOST(
      createRequest("POST", "/api/roster/shift-templates", {
        body: { ...validBody, shiftStart: "18:00", shiftEnd: "15:00" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/shiftEnd/);
  });

  it("returns 400 on missing required field", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "admin" });
    const res = await CreatePOST(
      createRequest("POST", "/api/roster/shift-templates", {
        body: { ...validBody, label: "" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for staff role", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff", serviceId: "svc-1" });
    const res = await CreatePOST(
      createRequest("POST", "/api/roster/shift-templates", { body: validBody }),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.shiftTemplate.create).not.toHaveBeenCalled();
  });

  it("returns 403 for member at a different service", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "member", serviceId: "svc-other" });
    const res = await CreatePOST(
      createRequest("POST", "/api/roster/shift-templates", { body: validBody }),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.shiftTemplate.create).not.toHaveBeenCalled();
  });

  it("creates a template on happy path (member at the same service)", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "member", serviceId: "svc-1" });
    prismaMock.shiftTemplate.create.mockResolvedValue(makeTemplate());
    const res = await CreatePOST(
      createRequest("POST", "/api/roster/shift-templates", { body: validBody }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.template.label).toBe("ASC educator 3-6pm");
    expect(body.template.sessionType).toBe("asc");
  });

  it("admin can create at any service", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.shiftTemplate.create.mockResolvedValue(
      makeTemplate({ serviceId: "svc-other" }),
    );
    const res = await CreatePOST(
      createRequest("POST", "/api/roster/shift-templates", {
        body: { ...validBody, serviceId: "svc-other" },
      }),
    );
    expect(res.status).toBe(201);
  });

  it("returns 409 when label collides at the same service (P2002)", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "admin" });
    prismaMock.shiftTemplate.create.mockRejectedValue({ code: "P2002" });
    const res = await CreatePOST(
      createRequest("POST", "/api/roster/shift-templates", { body: validBody }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });
});

describe("DELETE /api/roster/shift-templates/[id]", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await DeleteRoute(
      createRequest("DELETE", "/api/roster/shift-templates/tpl-1"),
      paramsOf("tpl-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when template does not exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.shiftTemplate.findUnique.mockResolvedValue(null);
    const res = await DeleteRoute(
      createRequest("DELETE", "/api/roster/shift-templates/missing"),
      paramsOf("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for member at a different service", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "member", serviceId: "svc-other" });
    prismaMock.shiftTemplate.findUnique.mockResolvedValue({
      id: "tpl-1",
      serviceId: "svc-1",
    });
    const res = await DeleteRoute(
      createRequest("DELETE", "/api/roster/shift-templates/tpl-1"),
      paramsOf("tpl-1"),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.shiftTemplate.delete).not.toHaveBeenCalled();
  });

  it("returns 403 for staff role", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "staff", serviceId: "svc-1" });
    prismaMock.shiftTemplate.findUnique.mockResolvedValue({
      id: "tpl-1",
      serviceId: "svc-1",
    });
    const res = await DeleteRoute(
      createRequest("DELETE", "/api/roster/shift-templates/tpl-1"),
      paramsOf("tpl-1"),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.shiftTemplate.delete).not.toHaveBeenCalled();
  });

  it("deletes the template on happy path (member at same service)", async () => {
    mockSession({ id: "u-1", name: "Alice", role: "member", serviceId: "svc-1" });
    prismaMock.shiftTemplate.findUnique.mockResolvedValue({
      id: "tpl-1",
      serviceId: "svc-1",
    });
    prismaMock.shiftTemplate.delete.mockResolvedValue(makeTemplate());
    const res = await DeleteRoute(
      createRequest("DELETE", "/api/roster/shift-templates/tpl-1"),
      paramsOf("tpl-1"),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.shiftTemplate.delete).toHaveBeenCalledWith({
      where: { id: "tpl-1" },
    });
  });

  it("admin can delete at any service", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.shiftTemplate.findUnique.mockResolvedValue({
      id: "tpl-1",
      serviceId: "svc-other",
    });
    prismaMock.shiftTemplate.delete.mockResolvedValue(makeTemplate());
    const res = await DeleteRoute(
      createRequest("DELETE", "/api/roster/shift-templates/tpl-1"),
      paramsOf("tpl-1"),
    );
    expect(res.status).toBe(200);
  });
});
