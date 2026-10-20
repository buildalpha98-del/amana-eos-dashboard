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

// Keep the real error classes (the routes map them with instanceof).
vi.mock("@/lib/knox/actions", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, approvePendingAction: vi.fn(), dismissPendingAction: vi.fn() };
});

vi.mock("@/lib/knox", () => ({ runTriageJob: vi.fn(async () => "done") }));

const runAfterMock = vi.fn();
vi.mock("@/lib/run-after", () => ({ runAfter: (task: () => Promise<void>) => runAfterMock(task) }));

import { GET as LIST } from "@/app/api/knox/actions/route";
import { POST as APPROVE } from "@/app/api/knox/actions/[id]/approve/route";
import { POST as DISMISS } from "@/app/api/knox/actions/[id]/dismiss/route";
import { getCentreScope } from "@/lib/centre-scope";
import {
  approvePendingAction,
  dismissPendingAction,
  PendingActionGone,
  PendingActionHidden,
} from "@/lib/knox/actions";
import { runTriageJob } from "@/lib/knox";
import { ApiError } from "@/lib/api-error";

const mockedScope = vi.mocked(getCentreScope);
const mockedApprove = vi.mocked(approvePendingAction);
const mockedDismiss = vi.mocked(dismissPendingAction);
const mockedRunTriageJob = vi.mocked(runTriageJob);

const ctx = (id = "card-1") => ({ params: Promise.resolve({ id }) });

function setup(role: "member" | "owner" | "staff" = "member") {
  _clearUserActiveCache();
  vi.clearAllMocks();
  mockSession({ id: "u1", name: "User", role });
  prismaMock.user.findUnique.mockImplementation(() => Promise.resolve({ active: true }));
  mockedScope.mockResolvedValue({ serviceIds: ["svc-1"] });
  mockedApprove.mockResolvedValue({ resultId: "res-1", jobId: null });
  mockedDismiss.mockResolvedValue(undefined);
  prismaMock.pendingAction.findMany.mockResolvedValue([{ id: "card-1", serviceId: "svc-1" }]);
}

describe("GET /api/knox/actions", () => {
  beforeEach(() => setup());

  const get = (qs = "") => LIST(createRequest("GET", `/api/knox/actions${qs}`));

  it("401 with no session", async () => {
    mockNoSession();
    expect((await get()).status).toBe(401);
  });

  it("403 for role staff", async () => {
    mockSession({ id: "u2", name: "Educator", role: "staff" });
    expect((await get()).status).toBe(403);
  });

  it("400 for an unknown status", async () => {
    expect((await get("?status=bogus")).status).toBe(400);
    expect(prismaMock.pendingAction.findMany).not.toHaveBeenCalled();
  });

  it("404 when the serviceId filter is outside scope", async () => {
    mockedScope.mockResolvedValue({ serviceIds: ["other"] });
    expect((await get("?serviceId=svc-1")).status).toBe(404);
    expect(prismaMock.pendingAction.findMany).not.toHaveBeenCalled();
  });

  it("defaults to open cards, scoped, newest first, max 200", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).actions).toHaveLength(1);
    const args = prismaMock.pendingAction.findMany.mock.calls[0][0];
    expect(args.where.committedAt).toBeNull();
    expect(args.where.dismissedAt).toBeNull();
    expect(args.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(args.where.serviceId).toEqual({ in: ["svc-1"] });
    expect(args.orderBy).toEqual({ createdAt: "desc" });
    expect(args.take).toBe(200);
  });

  it("unscoped roles get no serviceId constraint", async () => {
    mockedScope.mockResolvedValue({ serviceIds: null });
    await get();
    expect(prismaMock.pendingAction.findMany.mock.calls[0][0].where).not.toHaveProperty("serviceId");
  });

  it("narrows to a single in-scope serviceId", async () => {
    await get("?serviceId=svc-1");
    expect(prismaMock.pendingAction.findMany.mock.calls[0][0].where.serviceId).toBe("svc-1");
  });

  it("status=committed / dismissed / expired build the right filters", async () => {
    await get("?status=committed");
    expect(prismaMock.pendingAction.findMany.mock.calls[0][0].where.committedAt).toEqual({ not: null });
    await get("?status=dismissed");
    expect(prismaMock.pendingAction.findMany.mock.calls[1][0].where.dismissedAt).toEqual({ not: null });
    await get("?status=expired");
    const expired = prismaMock.pendingAction.findMany.mock.calls[2][0].where;
    expect(expired.committedAt).toBeNull();
    expect(expired.dismissedAt).toBeNull();
    expect(expired.expiresAt.lte).toBeInstanceOf(Date);
  });
});

describe("POST /api/knox/actions/[id]/approve", () => {
  beforeEach(() => setup());

  const approve = (id = "card-1", body?: Record<string, unknown>) =>
    APPROVE(createRequest("POST", `/api/knox/actions/${id}/approve`, body ? { body } : undefined), ctx(id));

  it("401 with no session", async () => {
    mockNoSession();
    expect((await approve()).status).toBe(401);
  });

  it("403 for role staff", async () => {
    mockSession({ id: "u2", name: "Educator", role: "staff" });
    expect((await approve()).status).toBe(403);
    expect(mockedApprove).not.toHaveBeenCalled();
  });

  it("404 when the executor hides the card (unknown or out of scope)", async () => {
    mockedApprove.mockRejectedValue(new PendingActionHidden());
    mockedScope.mockResolvedValue({ serviceIds: ["other"] });
    expect((await approve()).status).toBe(404);
    // The executor receives the caller's scope, so it can hide the card.
    expect(mockedApprove.mock.calls[0][2]).toEqual({ id: "u1", role: "member", serviceIds: ["other"] });
  });

  it("410 when the card has expired or was already actioned", async () => {
    mockedApprove.mockRejectedValue(new PendingActionGone());
    expect((await approve()).status).toBe(410);
  });

  it("409 passes through the executor's stale-severity conflict", async () => {
    mockedApprove.mockRejectedValue(ApiError.conflict("Severity is already serious; Knox never lowers it"));
    const res = await approve();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/never lowers/);
  });

  it("400 when the stored payload fails the helper schema", async () => {
    mockedApprove.mockRejectedValue(ApiError.badRequest("This card's changes are no longer valid"));
    expect((await approve()).status).toBe(400);
  });

  it("200 returns resultId and jobId; never forwards a client payload", async () => {
    const res = await approve("card-1", { payload: { severity: "reportable" }, kind: "set_severity" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultId: "res-1", jobId: null });
    // Exactly (db, id, actor, now) — nothing from the request body.
    const call = mockedApprove.mock.calls[0];
    expect(call[1]).toBe("card-1");
    expect(call[2]).toEqual({ id: "u1", role: "member", serviceIds: ["svc-1"] });
    expect(call).toHaveLength(4);
    expect(JSON.stringify(call.slice(1))).not.toMatch(/reportable/);
    expect(runAfterMock).not.toHaveBeenCalled();
  });

  it("schedules the re-triage job after the response when the executor returns a jobId", async () => {
    mockedApprove.mockResolvedValue({ resultId: "res-2", jobId: "job-9" });
    const res = await approve();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultId: "res-2", jobId: "job-9" });
    expect(runAfterMock).toHaveBeenCalledTimes(1);
    expect(mockedRunTriageJob).not.toHaveBeenCalled(); // deferred, not run inline
    await runAfterMock.mock.calls[0][0]();
    expect(mockedRunTriageJob).toHaveBeenCalledWith("job-9");
  });

  it("a failing re-triage job does not throw out of the deferred thunk", async () => {
    mockedApprove.mockResolvedValue({ resultId: "res-2", jobId: "job-9" });
    mockedRunTriageJob.mockRejectedValueOnce(new Error("boom"));
    await approve();
    await expect(runAfterMock.mock.calls[0][0]()).resolves.toBeUndefined();
  });
});

describe("POST /api/knox/actions/[id]/dismiss", () => {
  beforeEach(() => setup());

  const dismiss = (body?: Record<string, unknown>, id = "card-1") =>
    DISMISS(createRequest("POST", `/api/knox/actions/${id}/dismiss`, body ? { body } : undefined), ctx(id));

  it("401 with no session", async () => {
    mockNoSession();
    expect((await dismiss({})).status).toBe(401);
  });

  it("403 for role staff", async () => {
    mockSession({ id: "u2", name: "Educator", role: "staff" });
    expect((await dismiss({})).status).toBe(403);
    expect(mockedDismiss).not.toHaveBeenCalled();
  });

  it("400 when the reason is longer than 500 characters", async () => {
    expect((await dismiss({ reason: "x".repeat(501) })).status).toBe(400);
    expect(mockedDismiss).not.toHaveBeenCalled();
  });

  it("400 when the reason is not a string", async () => {
    expect((await dismiss({ reason: 42 })).status).toBe(400);
  });

  it("404 when the executor hides the card", async () => {
    mockedDismiss.mockRejectedValue(new PendingActionHidden());
    mockedScope.mockResolvedValue({ serviceIds: ["other"] });
    expect((await dismiss({})).status).toBe(404);
  });

  it("410 when the card has expired", async () => {
    mockedDismiss.mockRejectedValue(new PendingActionGone());
    expect((await dismiss({ reason: "not relevant" })).status).toBe(410);
  });

  it("200 with a reason", async () => {
    const res = await dismiss({ reason: "Already handled by phone" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const call = mockedDismiss.mock.calls[0];
    expect(call[1]).toBe("card-1");
    expect(call[2]).toEqual({ id: "u1", serviceIds: ["svc-1"] });
    expect(call[3]).toBe("Already handled by phone");
  });

  it("200 with no body at all (reason is optional)", async () => {
    const res = await dismiss();
    expect(res.status).toBe(200);
    expect(mockedDismiss.mock.calls[0][3]).toBeUndefined();
  });
});
