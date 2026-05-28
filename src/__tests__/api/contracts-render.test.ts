/**
 * Tests for GET /api/contracts/[id]/render — the staff portal's inline
 * contract viewer endpoint.
 *
 * Matrix:
 *   - Own template-issued contract: 200, body is rendered HTML
 *   - Admin viewing any contract: 200
 *   - Other staff viewing someone else's: 403
 *   - Blank-form contract (no templateId): 404
 *   - Missing contract: 404
 *   - Unauthenticated: 401
 *   - Resolved tag values from templateValues are interpolated into the body
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

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

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { GET } from "@/app/api/contracts/[id]/render/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const DOC = {
  type: "doc" as const,
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Hello, " },
        { type: "mergeTag", attrs: { key: "staff.firstName" } },
        { type: "text", text: "." },
      ],
    },
  ],
};

function callRoute(id: string) {
  const req = createRequest("GET", `/api/contracts/${id}/render`);
  return GET(req, { params: Promise.resolve({ id }) });
}

describe("GET /api/contracts/[id]/render", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await callRoute("ct-1");
    expect(res.status).toBe(401);
  });

  it("returns rendered HTML for the contract owner (template-based)", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "ct-1",
      userId: "staff-1",
      templateId: "tpl-1",
      templateValues: {
        auto: { "staff.firstName": "Daniel" },
        manual: {},
      },
      template: { contentJson: DOC },
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "staff-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("ct-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain("Hello, Daniel.");
  });

  it("manual values override auto values when both define the same key", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "ct-1",
      userId: "staff-1",
      templateId: "tpl-1",
      templateValues: {
        auto: { "staff.firstName": "Auto" },
        manual: { "staff.firstName": "Manual" },
      },
      template: { contentJson: DOC },
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "staff-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("ct-1");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Hello, Manual.");
    expect(body).not.toContain("Hello, Auto");
  });

  it("returns 200 for an admin viewing another user's contract", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "ct-1",
      userId: "staff-99",
      templateId: "tpl-1",
      templateValues: { auto: { "staff.firstName": "Bob" }, manual: {} },
      template: { contentJson: DOC },
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "admin-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("ct-1");
    expect(res.status).toBe(200);
  });

  it("returns 403 when a non-admin staff member views another user's contract", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "ct-1",
      userId: "staff-99",
      templateId: "tpl-1",
      templateValues: { auto: {}, manual: {} },
      template: { contentJson: DOC },
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "staff-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("ct-1");
    expect(res.status).toBe(403);
  });

  it("returns 404 for a blank-form contract (no templateId)", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "ct-1",
      userId: "staff-1",
      templateId: null,
      templateValues: null,
      template: null,
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "staff-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("ct-1");
    expect(res.status).toBe(404);
  });

  it("returns 404 when the template was deleted (templateId set, template relation null)", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.employmentContract.findUnique.mockResolvedValue({
      id: "ct-1",
      userId: "staff-1",
      templateId: "tpl-ghost",
      templateValues: { auto: {}, manual: {} },
      template: null,
    });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) => {
      if (where?.id === "staff-1") return Promise.resolve({ active: true });
      return Promise.resolve(null);
    });

    const res = await callRoute("ct-1");
    expect(res.status).toBe(404);
  });

  it("returns 404 when the contract doesn't exist", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "member" });
    prismaMock.employmentContract.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    const res = await callRoute("missing");
    expect(res.status).toBe(404);
  });
});
