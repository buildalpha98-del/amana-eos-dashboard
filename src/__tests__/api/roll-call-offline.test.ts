import type { Prisma } from "@prisma/client";
import { sendSignInNotification } from "@/lib/notifications/attendance";
import { mockArrivalRecords } from "../helpers/attendance-arrival-mock";
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
  mockArrivalRecords();
  prismaMock.child.findFirst.mockResolvedValue({ id: "c1" });
  const receipts = new Map<string, Prisma.AttendanceMutationCreateManyInput>();
  prismaMock.attendanceMutation.createMany.mockImplementation(
    async ({ data }: { data: Prisma.AttendanceMutationCreateManyInput[] }) => {
      const row = data[0];
      if (receipts.has(row.id)) return { count: 0 };
      receipts.set(row.id, { ...row });
      return { count: 1 };
    },
  );
  prismaMock.attendanceMutation.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) =>
      receipts.get(where.id) ?? null,
  );
  prismaMock.attendanceMutation.update.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { response: Prisma.InputJsonValue };
    }) => {
      Object.assign(receipts.get(where.id)!, data);
      return receipts.get(where.id);
    },
  );
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

    const callArgs = prismaMock.attendanceRecord.createMany.mock.calls[0][0];
    // The signInTime in the upsert payload should match the caller-supplied
    // time, not "now".
    const writtenTime = (callArgs.data[0].signInTime as Date).toISOString();
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
    const callArgs = prismaMock.attendanceRecord.createMany.mock.calls[0][0];
    const writtenTime = (callArgs.data[0].signInTime as Date).getTime();
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
    const callArgs = prismaMock.attendanceRecord.createMany.mock.calls[0][0];
    const writtenTime = (callArgs.data[0].signInTime as Date).getTime();
    expect(writtenTime).toBeGreaterThanOrEqual(before);
    expect(writtenTime).toBeLessThanOrEqual(after + 100);
  });

  it("accepts the existing offline clientMutationId field", async () => {
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

describe("Durable roll-call receipts", () => {
  function payload(overrides: Record<string, unknown> = {}) {
    return {
      childId: "c1",
      serviceId: "s1",
      date: "2026-10-12",
      sessionType: "asc",
      action: "sign_in",
      clientMutationId: VALID_CMID,
      ...overrides,
    };
  }
  const send = (body: Record<string, unknown>) =>
    rollCallPost(createRequest("POST", "/api/attendance/roll-call", { body }));

  beforeEach(() =>
    mockSession({ id: "u1", name: "S", role: "staff", serviceId: "s1" }),
  );

  it("returns the original result after a later reset without rewriting or notifying", async () => {
    const rows = mockArrivalRecords();
    const body = payload({
      occurredAt: new Date().toISOString(),
      notes: "Original",
    });
    const first = await send(body);
    expect(first.status).toBe(200);
    const original = await first.json();
    // Simulate a later committed correction/undo from another writer.
    for (const row of rows.values())
      Object.assign(row, {
        signInTime: null,
        status: "booked",
        notes: "Corrected",
      });
    const retry = await send(body);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(original);
    expect(prismaMock.attendanceRecord.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.dailyAttendance.upsert).toHaveBeenCalledTimes(1);
    expect(sendSignInNotification).toHaveBeenCalledTimes(1);
    expect([...rows.values()][0]).toMatchObject({
      status: "booked",
      signInTime: null,
      notes: "Corrected",
    });
  });

  it.each([
    { action: "undo" },
    { notes: "Changed" },
    { childId: "c2" },
    { serviceId: "s2" },
    { date: "2026-10-13" },
    { sessionType: "bsc" },
    { signedByName: "Someone else" },
    { signature: "changed signature" },
    { occurredAt: "2026-10-12T00:00:00.000Z" },
  ])("rejects ID reuse with different request details: %j", async (change) => {
    mockSession({ id: "u1", name: "S", role: "owner" });
    expect((await send(payload())).status).toBe(200);
    const retry = await send(payload(change));
    expect(retry.status).toBe(409);
    expect(prismaMock.attendanceRecord.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
    expect(sendSignInNotification).toHaveBeenCalledTimes(1);
  });

  it("rejects another account even when it has service access", async () => {
    expect((await send(payload())).status).toBe(200);
    mockSession({ id: "u2", name: "Other", role: "staff", serviceId: "s1" });
    expect((await send(payload())).status).toBe(409);
    expect(prismaMock.attendanceRecord.createMany).toHaveBeenCalledTimes(1);
  });

  it("checks current child scope before returning an existing receipt", async () => {
    expect((await send(payload())).status).toBe(200);
    prismaMock.child.findFirst.mockResolvedValue(null);
    expect((await send(payload())).status).toBe(404);
    expect(prismaMock.attendanceMutation.createMany).toHaveBeenCalledTimes(1);
  });

  it("can acknowledge an already committed action after its timestamp expires", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-12T04:00:00Z"));
      const body = payload({ occurredAt: "2026-10-12T03:00:00.000Z" });
      const first = await send(body);
      expect(first.status).toBe(200);
      vi.setSystemTime(new Date("2026-10-14T04:00:00Z"));
      const retry = await send(body);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual(await first.json());
      expect(prismaMock.attendanceRecord.createMany).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["undo", "mark_absent", "note"])("replays %s without applying it again", async (action) => {
    prismaMock.attendanceRecord.findUnique.mockResolvedValue({ id: "ar1" });
    prismaMock.attendanceRecord.upsert.mockResolvedValue({ id: "ar1", status: "booked" });
    prismaMock.attendanceRecord.update.mockResolvedValue({ id: "ar1", notes: "Original note" });
    const body = payload({ action, notes: "Original note" });
    const first = await send(body);
    const second = await send(body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(prismaMock.dailyAttendance.upsert).toHaveBeenCalledTimes(1);
    expect(action === "note" ? prismaMock.attendanceRecord.update : prismaMock.attendanceRecord.upsert).toHaveBeenCalledTimes(1);
    expect(sendSignInNotification).not.toHaveBeenCalled();
  });

  it("does not send a notification or complete the receipt when aggregation fails", async () => {
    prismaMock.dailyAttendance.upsert.mockRejectedValueOnce(new Error("Aggregation failed"));
    expect((await send(payload())).status).toBe(500);
    expect(sendSignInNotification).not.toHaveBeenCalled();
    expect(prismaMock.attendanceMutation.update).not.toHaveBeenCalled();
  });

  it("keeps legacy requests without an ID compatible without inventing receipts", async () => {
    expect((await send(payload({ clientMutationId: undefined }))).status).toBe(
      200,
    );
    expect(prismaMock.attendanceMutation.createMany).not.toHaveBeenCalled();
  });
});
