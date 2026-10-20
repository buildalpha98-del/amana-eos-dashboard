import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../../helpers/auth-mock";
import { createRequest } from "../../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 })),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/centre-scope", () => ({
  getCentreScope: vi.fn(async () => ({ serviceIds: null })),
}));

import { POST } from "@/app/api/knox/assessments/[id]/ack/route";
import { getCentreScope } from "@/lib/centre-scope";

const mockedScope = vi.mocked(getCentreScope);

const ASSESSMENT = {
  id: "a1",
  serviceId: "svc-1",
  tier: "serious",
  subjectType: "incident",
  subjectId: "inc-1",
};

const FIRST_ACK = new Date("2026-10-20T01:00:00Z");

function ctx(id = "a1") {
  return { params: Promise.resolve({ id }) };
}

function post(id = "a1") {
  return POST(createRequest("POST", `/api/knox/assessments/${id}/ack`), ctx(id));
}

describe("POST /api/knox/assessments/[id]/ack", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    mockSession({ id: "u1", name: "Director", role: "member" });
    prismaMock.user.findUnique.mockImplementation(() => Promise.resolve({ active: true }));
    mockedScope.mockResolvedValue({ serviceIds: ["svc-1"] });
    prismaMock.triageAssessment.findUnique.mockImplementation((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === "a1" ? ASSESSMENT : null),
    );
    prismaMock.triageAlert.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.triageAlert.findFirst.mockResolvedValue({ acknowledgedAt: FIRST_ACK });
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  it("401 with no session", async () => {
    mockNoSession();
    expect((await post()).status).toBe(401);
  });

  it("403 for role staff", async () => {
    mockSession({ id: "u2", name: "Educator", role: "staff" });
    expect((await post()).status).toBe(403);
    expect(prismaMock.triageAlert.updateMany).not.toHaveBeenCalled();
  });

  it("404 when the assessment does not exist", async () => {
    expect((await post("missing")).status).toBe(404);
    expect(prismaMock.triageAlert.updateMany).not.toHaveBeenCalled();
  });

  it("404 (not 403) when the assessment is outside the caller's centres", async () => {
    mockedScope.mockResolvedValue({ serviceIds: ["other"] });
    const res = await post();
    expect(res.status).toBe(404);
    expect(prismaMock.triageAlert.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
  });

  it("acknowledges every unacknowledged alert row, recipient or not, and logs it", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(prismaMock.triageAlert.updateMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.triageAlert.updateMany.mock.calls[0][0];
    // No recipient filter: marker rows with a null recipient must be covered.
    expect(args.where).toEqual({ assessmentId: "a1", acknowledgedAt: null });
    expect(args.data.acknowledgedById).toBe("u1");
    expect(args.data.acknowledgedAt).toBeInstanceOf(Date);
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        action: "knox.acknowledged",
        entityType: "TriageAssessment",
        entityId: "a1",
        details: { tier: "serious", subjectType: "incident", subjectId: "inc-1" },
      },
    });
    const body = await res.json();
    expect(typeof body.acknowledgedAt).toBe("string");
  });

  it("is idempotent: a repeat returns 200 with the earliest acknowledgedAt and does not log again", async () => {
    prismaMock.triageAlert.updateMany.mockResolvedValue({ count: 0 });
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).acknowledgedAt).toBe(FIRST_ACK.toISOString());
    const find = prismaMock.triageAlert.findFirst.mock.calls[0][0];
    expect(find.where).toEqual({ assessmentId: "a1", acknowledgedAt: { not: null } });
    expect(find.orderBy).toEqual({ acknowledgedAt: "asc" });
    expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
  });

  it("409 when the assessment has no alert rows to acknowledge", async () => {
    prismaMock.triageAlert.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.triageAlert.findFirst.mockResolvedValue(null);
    expect((await post()).status).toBe(409);
  });

  it("unscoped roles (owner) can acknowledge any centre", async () => {
    mockSession({ id: "o1", name: "Owner", role: "owner" });
    mockedScope.mockResolvedValue({ serviceIds: null });
    expect((await post()).status).toBe(200);
  });
});
