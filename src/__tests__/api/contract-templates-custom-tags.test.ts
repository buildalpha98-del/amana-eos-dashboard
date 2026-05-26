import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

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

import {
  GET,
  POST,
} from "@/app/api/contract-templates/custom-tags/route";
import { DELETE } from "@/app/api/contract-templates/custom-tags/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/contract-templates/custom-tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/contract-templates/custom-tags"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles (member, staff)", async () => {
    for (const role of ["member", "staff"] as const) {
      mockSession({ id: "u-1", name: "U", role });
      const res = await GET(
        createRequest("GET", "/api/contract-templates/custom-tags"),
      );
      expect(res.status).toBe(403);
    }
  });

  it("returns 200 with the tag list for admin", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    prismaMock.contractCustomTag.findMany.mockResolvedValue([
      {
        id: "t-1",
        key: "custom.projectCode",
        label: "Project Code",
        createdAt: new Date("2026-05-01"),
      },
    ]);
    const res = await GET(
      createRequest("GET", "/api/contract-templates/custom-tags"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].key).toBe("custom.projectCode");
  });
});

describe("POST /api/contract-templates/custom-tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/contract-templates/custom-tags", {
        body: { label: "Project Code" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockSession({ id: "u-1", name: "U", role: "member" });
    const res = await POST(
      createRequest("POST", "/api/contract-templates/custom-tags", {
        body: { label: "Project Code" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when label is missing", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    const res = await POST(
      createRequest("POST", "/api/contract-templates/custom-tags", {
        body: {},
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when label has no alphanumeric content", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    const res = await POST(
      createRequest("POST", "/api/contract-templates/custom-tags", {
        body: { label: "!!!" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/letter or number/i);
  });

  it("returns 409 with a friendly message when key already exists", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    prismaMock.contractCustomTag.findUnique.mockResolvedValue({
      id: "t-existing",
      label: "Project Code",
    });
    const res = await POST(
      createRequest("POST", "/api/contract-templates/custom-tags", {
        body: { label: "Project Code" },
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
    expect(prismaMock.contractCustomTag.create).not.toHaveBeenCalled();
  });

  it("happy path: slugifies label to custom.<camelCase> key and writes ActivityLog", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    prismaMock.contractCustomTag.findUnique.mockResolvedValue(null);
    prismaMock.contractCustomTag.create.mockResolvedValue({
      id: "t-new",
      key: "custom.projectCode",
      label: "Project Code",
      createdAt: new Date("2026-05-18"),
    });
    prismaMock.activityLog.create.mockResolvedValue({});

    const res = await POST(
      createRequest("POST", "/api/contract-templates/custom-tags", {
        body: { label: "  Project Code  " },
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.key).toBe("custom.projectCode");
    // Body sent to Prisma was trimmed + slugified
    expect(prismaMock.contractCustomTag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: "custom.projectCode",
          label: "Project Code",
          createdById: "u-admin",
        }),
      }),
    );
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "create",
          entityType: "ContractCustomTag",
        }),
      }),
    );
  });
});

describe("DELETE /api/contract-templates/custom-tags/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  function buildContext(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await DELETE(
      createRequest("DELETE", "/api/contract-templates/custom-tags/t-1"),
      buildContext("t-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    mockSession({ id: "u-1", name: "U", role: "staff" });
    const res = await DELETE(
      createRequest("DELETE", "/api/contract-templates/custom-tags/t-1"),
      buildContext("t-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when the tag does not exist", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    prismaMock.contractCustomTag.findUnique.mockResolvedValue(null);
    const res = await DELETE(
      createRequest("DELETE", "/api/contract-templates/custom-tags/missing"),
      buildContext("missing"),
    );
    expect(res.status).toBe(404);
    expect(prismaMock.contractCustomTag.delete).not.toHaveBeenCalled();
  });

  it("happy path: deletes the row and logs the action", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    prismaMock.contractCustomTag.findUnique.mockResolvedValue({
      id: "t-1",
      key: "custom.projectCode",
      label: "Project Code",
    });
    prismaMock.contractCustomTag.delete.mockResolvedValue({});
    prismaMock.activityLog.create.mockResolvedValue({});

    const res = await DELETE(
      createRequest("DELETE", "/api/contract-templates/custom-tags/t-1"),
      buildContext("t-1"),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.contractCustomTag.delete).toHaveBeenCalledWith({
      where: { id: "t-1" },
    });
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "delete",
          entityType: "ContractCustomTag",
          entityId: "t-1",
        }),
      }),
    );
  });
});
