/**
 * Practical sign-off, readiness, and admin override APIs.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

import { POST as SIGNOFF } from "@/app/api/induction/signoff/route";
import { GET as READINESS } from "@/app/api/induction/readiness/route";
import { POST as OVERRIDE } from "@/app/api/induction/override/route";

function baseMocks() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation((args: unknown) => {
    const { select } = args as { select?: Record<string, boolean> };
    if (select && "active" in select) return Promise.resolve({ active: true });
    return Promise.resolve({ active: true });
  });
}
beforeEach(baseMocks);

describe("POST /api/induction/signoff", () => {
  const body = { userId: "new-1", itemId: "item-1" };

  it("403 for a non-signer role (member/OSHC Coordinator)", async () => {
    mockSession({ id: "c1", name: "Coord", role: "member" });
    const res = await SIGNOFF(createRequest("POST", "/api/induction/signoff", { body }));
    expect(res.status).toBe(403);
  });

  it("403 for staff", async () => {
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    const res = await SIGNOFF(createRequest("POST", "/api/induction/signoff", { body }));
    expect(res.status).toBe(403);
  });

  it("allows head_office (State Manager) to sign off", async () => {
    mockSession({ id: "sm1", name: "SM", role: "head_office" });
    prismaMock.practicalChecklistItem.findMany.mockResolvedValue([{ id: "item-1" }]);
    prismaMock.practicalSignoff.findMany.mockResolvedValue([{ itemId: "item-1" }]);
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { select } = args as { select?: Record<string, boolean> };
      if (select && "active" in select) return Promise.resolve({ active: true });
      return Promise.resolve({ inductionStatus: "awaiting_signoff" });
    });
    // readiness passes
    prismaMock.lMSCourse.findMany.mockResolvedValue([]);
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([]);
    prismaMock.complianceCertificate.findFirst.mockResolvedValue({ id: "wwcc" });
    prismaMock.policyDocument.findMany.mockResolvedValue([]);
    prismaMock.user.findUnique.mockImplementationOnce(() =>
      Promise.resolve({ active: true }),
    );

    const res = await SIGNOFF(createRequest("POST", "/api/induction/signoff", { body }));
    expect(res.status).toBe(200);
    expect(prismaMock.practicalSignoff.upsert).toHaveBeenCalled();
  });

  it("rejects self-sign-off", async () => {
    mockSession({ id: "sm1", name: "SM", role: "admin" });
    const res = await SIGNOFF(
      createRequest("POST", "/api/induction/signoff", {
        body: { userId: "sm1", itemId: "item-1" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("clears the user when the last item is signed and readiness passes", async () => {
    mockSession({ id: "sm1", name: "SM", role: "admin" });
    prismaMock.practicalChecklistItem.findMany.mockResolvedValue([
      { id: "item-1" }, { id: "item-2" },
    ]);
    prismaMock.practicalSignoff.findMany.mockResolvedValue([
      { itemId: "item-1" }, { itemId: "item-2" },
    ]);
    // status read → awaiting_signoff
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { select } = args as { select?: Record<string, boolean> };
      if (select && "active" in select) return Promise.resolve({ active: true });
      if (select && "inductionStatus" in select && !("avatar" in (select ?? {})))
        return Promise.resolve({ inductionStatus: "awaiting_signoff" });
      // readiness profile
      return Promise.resolve({ avatar: "x", phone: "y", _count: { emergencyContacts: 1 } });
    });
    prismaMock.lMSCourse.findMany.mockResolvedValue([]);
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([]);
    prismaMock.complianceCertificate.findFirst.mockResolvedValue({ id: "wwcc" });
    prismaMock.policyDocument.findMany.mockResolvedValue([]);

    const res = await SIGNOFF(
      createRequest("POST", "/api/induction/signoff", {
        body: { userId: "new-1", itemId: "item-2" },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("cleared");
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inductionStatus: "cleared", inductionClearedById: "sm1" }),
      }),
    );
  });
});

describe("GET /api/induction/readiness", () => {
  it("returns the caller's readiness + practical checklist", async () => {
    mockSession({ id: "u1", name: "U", role: "staff" });
    prismaMock.lMSCourse.findMany.mockResolvedValue([]);
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([]);
    prismaMock.complianceCertificate.findFirst.mockResolvedValue({ id: "wwcc" });
    prismaMock.policyDocument.findMany.mockResolvedValue([]);
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const { select } = args as { select?: Record<string, boolean> };
      if (select && "active" in select) return Promise.resolve({ active: true });
      if (select && "inductionStatus" in select)
        return Promise.resolve({
          inductionStatus: "in_training", inductionDueDate: null,
          inductionGraceUntil: null, inductionClearedAt: null,
        });
      return Promise.resolve({ avatar: "x", phone: "y", _count: { emergencyContacts: 1 } });
    });
    prismaMock.practicalChecklistItem.findMany.mockResolvedValue([
      { id: "item-1", title: "OWNA sign-in", description: null, sortOrder: 0 },
    ]);
    prismaMock.practicalSignoff.findMany.mockResolvedValue([]);

    const res = await READINESS(createRequest("GET", "/api/induction/readiness"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("in_training");
    expect(body.practical).toHaveLength(1);
    expect(body.practical[0].signed).toBe(false);
  });
});

describe("POST /api/induction/override", () => {
  const future = new Date(Date.now() + 3600_000).toISOString();

  it("403 for admin (only owner/head_office may override)", async () => {
    mockSession({ id: "a1", name: "Admin", role: "admin" });
    const res = await OVERRIDE(
      createRequest("POST", "/api/induction/override", {
        body: { userId: "u1", until: future, reason: "emergency cover" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 when reason is missing", async () => {
    mockSession({ id: "o1", name: "Owner", role: "owner" });
    const res = await OVERRIDE(
      createRequest("POST", "/api/induction/override", {
        body: { userId: "u1", until: future },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("sets the window and writes an ActivityLog (owner)", async () => {
    mockSession({ id: "o1", name: "Owner", role: "owner" });
    const res = await OVERRIDE(
      createRequest("POST", "/api/induction/override", {
        body: { userId: "u1", until: future, reason: "single-shift emergency cover" },
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inductionOverrideUntil: expect.any(Date) }),
      }),
    );
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "induction.override" }),
      }),
    );
  });
});
