import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
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

import { POST } from "@/app/api/measurables/route";

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.activityLog.create.mockResolvedValue({} as never);
});

const BODY_BASE = {
  title: "Weekly enrolments",
  ownerId: "u-owner",
  scorecardId: "sc-1",
  goalValue: 100,
  goalDirection: "above" as const,
};

describe("POST /api/measurables — Stage 2 contract", () => {
  it("rejects missing scorecardId", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "admin" });
    const res = await POST(
      createRequest("POST", "/api/measurables", {
        body: { ...BODY_BASE, scorecardId: undefined },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the target scorecard doesn't exist", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "admin" });
    prismaMock.scorecard.findUnique.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", "/api/measurables", { body: BODY_BASE }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when caller cannot view the scorecard", async () => {
    mockSession({ id: "u-stranger", name: "Stranger", role: "admin" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-other",
      members: [],
    } as never);
    const res = await POST(
      createRequest("POST", "/api/measurables", { body: BODY_BASE }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects measurable owner who is NOT a participant of the scorecard", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "admin" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-owner",
      members: [], // ownerId on measurable is u-owner which IS the
                   // scorecard owner, so this case won't trigger.
    } as never);
    // Try to assign the measurable to someone NOT in the scorecard
    const res = await POST(
      createRequest("POST", "/api/measurables", {
        body: { ...BODY_BASE, ownerId: "u-stranger" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("happy path: measurable created without serviceId in the output", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "admin" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-owner",
      members: [{ userId: "u-member" }],
    } as never);
    prismaMock.measurable.create.mockResolvedValue({
      id: "m-1",
      title: "Weekly enrolments",
    } as never);
    const res = await POST(
      createRequest("POST", "/api/measurables", {
        body: { ...BODY_BASE, ownerId: "u-member" },
      }),
    );
    expect(res.status).toBe(201);
    const createCall = prismaMock.measurable.create.mock.calls[0][0];
    // serviceId is intentionally absent from the create payload now.
    expect(createCall.data.serviceId).toBeUndefined();
    expect(createCall.data.scorecardId).toBe("sc-1");
  });

  it("ignores serviceId in the input (Stage 2 dropped it from the schema)", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "admin" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-owner",
      members: [],
    } as never);
    prismaMock.measurable.create.mockResolvedValue({ id: "m-1" } as never);
    await POST(
      createRequest("POST", "/api/measurables", {
        body: { ...BODY_BASE, serviceId: "svc-stale" },
      }),
    );
    const createCall = prismaMock.measurable.create.mock.calls[0][0];
    expect(createCall.data.serviceId).toBeUndefined();
  });
});
