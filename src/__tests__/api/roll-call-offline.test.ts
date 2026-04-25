import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
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
vi.mock("@/lib/notifications/attendance", () => ({
  sendSignInNotification: vi.fn(() => Promise.resolve()),
  sendSignOutNotification: vi.fn(() => Promise.resolve()),
}));

import { _clearUserActiveCache } from "@/lib/server-auth";
import { POST as rollCallPost } from "@/app/api/attendance/roll-call/route";

const VALID_CMID = "550e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  // Required by the route's post-upsert aggregation step
  prismaMock.attendanceRecord.groupBy.mockResolvedValue([]);
  prismaMock.dailyAttendance.upsert.mockResolvedValue({});
});

describe("Roll call POST — offline-queue replay support", () => {
  it("uses caller-supplied occurredAt for the recorded sign-in time", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    const occurredAt = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10m ago
    prismaMock.attendanceRecord.upsert.mockResolvedValue({
      id: "ar1",
      childId: "c1",
      signInTime: new Date(occurredAt),
    });

    const res = await rollCallPost(
      createRequest("POST", "/api/attendance/roll-call", {
        body: {
          childId: "c1",
          serviceId: "s1",
          date: "2026-04-25",
          sessionType: "asc",
          action: "sign_in",
          occurredAt,
          clientMutationId: VALID_CMID,
        },
      }),
    );
    expect(res.status).toBe(200);

    const callArgs = prismaMock.attendanceRecord.upsert.mock.calls[0][0];
    // The signInTime in the upsert payload should match the caller-supplied
    // time, not "now".
    const writtenTime = (callArgs.update.signInTime as Date).toISOString();
    expect(writtenTime).toBe(occurredAt);
  });

  it("rejects occurredAt older than 24h (replay protection)", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    const occurredAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const res = await rollCallPost(
      createRequest("POST", "/api/attendance/roll-call", {
        body: {
          childId: "c1",
          serviceId: "s1",
          date: "2026-04-25",
          sessionType: "asc",
          action: "sign_in",
          occurredAt,
          clientMutationId: VALID_CMID,
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/24h/i);
  });

  it("clamps future occurredAt to now (clock skew defense)", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    prismaMock.attendanceRecord.upsert.mockResolvedValue({ id: "ar1" });
    const before = Date.now();
    const res = await rollCallPost(
      createRequest("POST", "/api/attendance/roll-call", {
        body: {
          childId: "c1",
          serviceId: "s1",
          date: "2026-04-25",
          sessionType: "asc",
          action: "sign_in",
          occurredAt: futureTime,
        },
      }),
    );
    const after = Date.now();
    expect(res.status).toBe(200);
    const callArgs = prismaMock.attendanceRecord.upsert.mock.calls[0][0];
    const writtenTime = (callArgs.update.signInTime as Date).getTime();
    // Must be roughly "now", not the future-stamped time
    expect(writtenTime).toBeGreaterThanOrEqual(before);
    expect(writtenTime).toBeLessThanOrEqual(after + 100);
  });

  it("falls back to now when occurredAt is omitted (online happy path)", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    prismaMock.attendanceRecord.upsert.mockResolvedValue({ id: "ar1" });
    const before = Date.now();
    const res = await rollCallPost(
      createRequest("POST", "/api/attendance/roll-call", {
        body: {
          childId: "c1",
          serviceId: "s1",
          date: "2026-04-25",
          sessionType: "asc",
          action: "sign_in",
        },
      }),
    );
    const after = Date.now();
    expect(res.status).toBe(200);
    const callArgs = prismaMock.attendanceRecord.upsert.mock.calls[0][0];
    const writtenTime = (callArgs.update.signInTime as Date).getTime();
    expect(writtenTime).toBeGreaterThanOrEqual(before);
    expect(writtenTime).toBeLessThanOrEqual(after + 100);
  });

  it("accepts a clientMutationId for activity-log correlation", async () => {
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" });
    prismaMock.attendanceRecord.upsert.mockResolvedValue({ id: "ar1" });
    const res = await rollCallPost(
      createRequest("POST", "/api/attendance/roll-call", {
        body: {
          childId: "c1",
          serviceId: "s1",
          date: "2026-04-25",
          sessionType: "asc",
          action: "sign_in",
          clientMutationId: VALID_CMID,
        },
      }),
    );
    // Either 200 (success) or 4xx for some other validation reason — what
    // matters is the schema accepts the field, so a malformed-request 400
    // about clientMutationId would also be a fail.
    expect(res.status).toBe(200);
  });
});
