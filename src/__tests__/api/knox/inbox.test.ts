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

import { GET } from "@/app/api/knox/inbox/route";
import { getCentreScope } from "@/lib/centre-scope";

const mockedScope = vi.mocked(getCentreScope);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>;
const argsOf = (fn: { mock: { calls: unknown[][] } }): Args[] => fn.mock.calls.map((c) => c[0] as Args);

function pick(list: Args[], pred: (a: Args) => boolean): Args {
  const found = list.find(pred);
  if (!found) throw new Error("no matching prisma call");
  return found;
}

const get = (qs = "") => GET(createRequest("GET", `/api/knox/inbox${qs}`));

const ASSESSMENT = {
  id: "a1",
  serviceId: "svc-1",
  subjectType: "incident",
  subjectId: "inc-1",
  tier: "serious",
  alerted: true,
  createdAt: new Date("2026-10-20T00:00:00Z"),
  service: { name: "Mawson Lakes" },
  alerts: [{ id: "al1", channel: "push", recipientUserId: "u1", acknowledgedAt: null }],
};

function setup(role: "member" | "owner" | "head_office" | "admin" | "staff" = "member") {
  _clearUserActiveCache();
  vi.clearAllMocks();
  mockSession({ id: "u1", name: "User", role });
  prismaMock.user.findUnique.mockImplementation(() => Promise.resolve({ active: true }));
  mockedScope.mockResolvedValue({ serviceIds: ["svc-1"] });
  prismaMock.triageAssessment.findMany.mockResolvedValue([ASSESSMENT]);
  prismaMock.pendingAction.findMany.mockResolvedValue([{ id: "card-1", serviceId: "svc-1" }]);
  prismaMock.triageJob.findMany.mockResolvedValue([{ id: "job-1", status: "failed", serviceId: "svc-1" }]);
  prismaMock.triageAssessment.findFirst.mockResolvedValue(null);
  prismaMock.incidentRecord.findUnique.mockResolvedValue(null);
  prismaMock.complaintRecord.findUnique.mockResolvedValue(null);
  prismaMock.staffIncidentReport.findUnique.mockResolvedValue(null);
}

describe("GET /api/knox/inbox", () => {
  beforeEach(() => setup());

  it("401 with no session", async () => {
    mockNoSession();
    expect((await get()).status).toBe(401);
  });

  it("403 for role staff", async () => {
    mockSession({ id: "u2", name: "Educator", role: "staff" });
    expect((await get()).status).toBe(403);
  });

  it("returns the four lists, each scoped by serviceId", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["awaitingAck", "failedJobs", "openCards", "recent"]);
    expect(body.awaitingAck).toHaveLength(1);
    expect(body.openCards).toHaveLength(1);

    const assessmentCalls = argsOf(prismaMock.triageAssessment.findMany);
    const awaiting = pick(assessmentCalls, (a) => a.where.alerted === true);
    expect(awaiting.where.alerts).toEqual({ none: { acknowledgedAt: { not: null } } });
    expect(awaiting.where.serviceId).toEqual({ in: ["svc-1"] });
    expect(awaiting.orderBy).toEqual({ createdAt: "desc" });
    expect(awaiting.take).toBe(50);
    // 7-day lookback on the awaiting list.
    const awaitAgeMs = Date.now() - awaiting.where.createdAt.gte.getTime();
    expect(Math.abs(awaitAgeMs - 7 * 86_400_000)).toBeLessThan(60_000);

    const recent = pick(assessmentCalls, (a) => !a.where.alerted && !a.where.subjectType && a.where.createdAt?.gte);
    expect(recent.where.serviceId).toEqual({ in: ["svc-1"] });
    expect(recent.take).toBe(50);
    const ageMs = Date.now() - recent.where.createdAt.gte.getTime();
    expect(Math.abs(ageMs - 7 * 86_400_000)).toBeLessThan(60_000);
    expect(recent.include?.service ?? recent.select?.service).toBeTruthy();

    const cards = prismaMock.pendingAction.findMany.mock.calls[0][0];
    expect(cards.where.committedAt).toBeNull();
    expect(cards.where.dismissedAt).toBeNull();
    expect(cards.where.serviceId).toEqual({ in: ["svc-1"] });
    expect(cards.take).toBe(100);
  });

  it("failedJobs is empty for member and never queried", async () => {
    const body = await (await get()).json();
    expect(body.failedJobs).toEqual([]);
    expect(prismaMock.triageJob.findMany).not.toHaveBeenCalled();
  });

  it.each(["owner", "head_office", "admin"] as const)("failedJobs is populated for %s", async (role) => {
    setup(role);
    const body = await (await get()).json();
    expect(body.failedJobs).toHaveLength(1);
    const args = prismaMock.triageJob.findMany.mock.calls[0][0];
    expect(args.where.status).toBe("failed");
    expect(args.take).toBe(50);
  });

  it("no centres in scope sees nothing from any list", async () => {
    mockedScope.mockResolvedValue({ serviceIds: [] });
    await get();
    for (const call of prismaMock.pendingAction.findMany.mock.calls) {
      expect(call[0].where.serviceId).toEqual({ in: [] });
    }
  });
});

describe("GET /api/knox/inbox?subject=", () => {
  beforeEach(() => setup());

  it("400 for an unknown subject type", async () => {
    expect((await get("?subject=widget:abc")).status).toBe(400);
  });

  it("400 for a malformed subject", async () => {
    expect((await get("?subject=incident")).status).toBe(400);
    expect((await get("?subject=incident:")).status).toBe(400);
  });

  it("404 when the subject's latest assessment is outside scope", async () => {
    mockedScope.mockResolvedValue({ serviceIds: ["other"] });
    prismaMock.triageAssessment.findFirst.mockResolvedValue({ serviceId: "svc-1" });
    expect((await get("?subject=incident:inc-1")).status).toBe(404);
  });

  it("falls back to the record itself when there is no assessment yet", async () => {
    prismaMock.incidentRecord.findUnique.mockResolvedValue({ serviceId: "svc-1" });
    const res = await get("?subject=incident:inc-1");
    expect(res.status).toBe(200);
    expect((await res.json()).subject).toEqual({ assessments: expect.any(Array), cards: expect.any(Array) });
  });

  it("404 for a record outside scope when no assessment exists", async () => {
    mockedScope.mockResolvedValue({ serviceIds: ["other"] });
    prismaMock.complaintRecord.findUnique.mockResolvedValue({ serviceId: "svc-1" });
    expect((await get("?subject=complaint:c1")).status).toBe(404);
  });

  it("404 when neither assessment nor record exists", async () => {
    expect((await get("?subject=staff_incident:s1")).status).toBe(404);
  });

  it("adds the subject's assessments (with alerts) and cards", async () => {
    prismaMock.triageAssessment.findFirst.mockResolvedValue({ serviceId: "svc-1" });
    const res = await get("?subject=incident:inc-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subject.assessments).toHaveLength(1);
    expect(body.subject.cards).toHaveLength(1);
    expect(body).toHaveProperty("awaitingAck");

    const subjectAssessments = pick(argsOf(prismaMock.triageAssessment.findMany), (a) => a.where.subjectType === "incident" && a.where.subjectId === "inc-1");
    expect(subjectAssessments.orderBy).toEqual({ createdAt: "desc" });
    expect(subjectAssessments.include?.alerts ?? subjectAssessments.select?.alerts).toBeTruthy();
    const subjectCards = pick(argsOf(prismaMock.pendingAction.findMany), (a) => a.where.subjectType === "incident" && a.where.subjectId === "inc-1");
    expect(subjectCards.where.serviceId).toEqual({ in: ["svc-1"] });
  });
});

describe("GET /api/knox/inbox?tiersFor=", () => {
  beforeEach(() => setup());

  it("400 for an unknown subject type", async () => {
    expect((await get("?tiersFor=widget:a,b")).status).toBe(400);
  });

  it("400 above 200 ids", async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `c${i}`).join(",");
    const res = await get(`?tiersFor=complaint:${ids}`);
    expect(res.status).toBe(400);
    expect(prismaMock.triageAssessment.findMany).not.toHaveBeenCalled();
  });

  it("accepts exactly 200 ids", async () => {
    prismaMock.triageAssessment.findMany.mockResolvedValue([]);
    const ids = Array.from({ length: 200 }, (_, i) => `c${i}`).join(",");
    expect((await get(`?tiersFor=complaint:${ids}`)).status).toBe(200);
  });

  it("returns the latest tier per subject, null where there is no in-scope assessment", async () => {
    prismaMock.triageAssessment.findMany.mockResolvedValue([
      { subjectId: "c1", tier: "serious", createdAt: new Date("2026-10-20T02:00:00Z") },
      { subjectId: "c1", tier: "minor", createdAt: new Date("2026-10-19T02:00:00Z") },
      { subjectId: "c2", tier: "moderate", createdAt: new Date("2026-10-19T02:00:00Z") },
    ]);
    const res = await get("?tiersFor=complaint:c1,c2,c3");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tiers: { c1: "serious", c2: "moderate", c3: null } });

    const args = prismaMock.triageAssessment.findMany.mock.calls[0][0];
    expect(args.where.subjectType).toBe("complaint");
    expect(args.where.subjectId).toEqual({ in: ["c1", "c2", "c3"] });
    expect(args.where.serviceId).toEqual({ in: ["svc-1"] });
    expect(args.orderBy).toEqual({ createdAt: "desc" });
  });

  it("out-of-scope subjects come back null (the query is scoped)", async () => {
    mockedScope.mockResolvedValue({ serviceIds: ["other"] });
    prismaMock.triageAssessment.findMany.mockImplementation((args: { where: { serviceId?: { in: string[] } } }) =>
      Promise.resolve(args.where.serviceId?.in.includes("svc-1") ? [{ subjectId: "c1", tier: "serious" }] : []),
    );
    const res = await get("?tiersFor=complaint:c1");
    expect(await res.json()).toEqual({ tiers: { c1: null } });
  });
});
