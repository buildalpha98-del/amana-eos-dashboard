/**
 * Tests for GET /api/my-portal/contracts — the staff-facing contract list
 * behind /my-contract.
 *
 * The behaviours that matter:
 *   - self-scoped: userId comes from the session, never the request
 *   - drafts are counted, never returned — staff learn that a contract is
 *     being prepared without seeing an admin's unfinished work
 *   - the raw blob URL never leaves the server; the client gets a boolean
 *     and fetches through /api/contracts/[id]/document
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

import { GET } from "@/app/api/my-portal/contracts/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const ACTIVE = {
  id: "ct-1",
  contractType: "ct_part_time",
  awardLevel: "cs2",
  awardLevelCustom: null,
  classification: null,
  payRate: 38,
  hoursPerWeek: 20,
  startDate: new Date("2026-02-01"),
  endDate: null,
  status: "active",
  acknowledgedByStaff: false,
  acknowledgedAt: null,
  templateId: "tpl-1",
  documentUrl: "https://blob.example.com/ct-1.pdf",
  createdAt: new Date("2026-01-20"),
};

describe("GET /api/my-portal/contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.employmentContract.count.mockResolvedValue(0);
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/my-portal/contracts"));
    expect(res.status).toBe(401);
  });

  it("scopes the query to the session user and excludes drafts", async () => {
    mockSession({ id: "u-1", name: "Educator", role: "staff" });
    prismaMock.employmentContract.findMany.mockResolvedValue([ACTIVE]);

    const res = await GET(createRequest("GET", "/api/my-portal/contracts"));
    expect(res.status).toBe(200);

    const where = prismaMock.employmentContract.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe("u-1");
    expect(where.status).toEqual({
      in: ["active", "superseded", "terminated"],
    });
  });

  it("replaces documentUrl with a hasDocument boolean", async () => {
    mockSession({ id: "u-1", name: "Educator", role: "staff" });
    prismaMock.employmentContract.findMany.mockResolvedValue([ACTIVE]);

    const res = await GET(createRequest("GET", "/api/my-portal/contracts"));
    const body = await res.json();

    expect(body.contracts[0].hasDocument).toBe(true);
    // The blob URL is a permanent unauthenticated handle on the document —
    // it must not reach the client.
    expect(body.contracts[0].documentUrl).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("blob.example.com");
  });

  it("reports hasPendingDraft when the only contract is an unissued draft", async () => {
    mockSession({ id: "u-1", name: "Educator", role: "staff" });
    prismaMock.employmentContract.findMany.mockResolvedValue([]);
    prismaMock.employmentContract.count.mockResolvedValue(1);

    const res = await GET(createRequest("GET", "/api/my-portal/contracts"));
    const body = await res.json();

    // This is the case that previously rendered as "no contract at all" —
    // /my-portal only ever queried status: "active".
    expect(body.contracts).toHaveLength(0);
    expect(body.hasPendingDraft).toBe(true);
  });

  it("reports no pending draft when the staff member has nothing at all", async () => {
    mockSession({ id: "u-1", name: "Educator", role: "staff" });
    prismaMock.employmentContract.findMany.mockResolvedValue([]);

    const res = await GET(createRequest("GET", "/api/my-portal/contracts"));
    const body = await res.json();

    expect(body.contracts).toHaveLength(0);
    expect(body.hasPendingDraft).toBe(false);
  });
});
