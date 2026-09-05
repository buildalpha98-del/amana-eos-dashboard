import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

// Mock logger
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

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET, PUT } from "@/app/api/my-portal/availability/route";

const URL_PATH = "/api/my-portal/availability";

/** A valid 7-entry set (Sunday+Saturday off, weekdays on). */
function fullWeek(
  overrides?: Partial<Record<number, Record<string, unknown>>>,
) {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    available: weekday !== 0 && weekday !== 6,
    startTime: null,
    endTime: null,
    note: null,
    ...(overrides?.[weekday] ?? {}),
  }));
}

describe("/api/my-portal/availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("GET 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", URL_PATH));
    expect(res.status).toBe(401);
  });

  it("PUT 401 when not authenticated", async () => {
    mockNoSession();
    const res = await PUT(
      createRequest("PUT", URL_PATH, { body: { availability: fullWeek() } }),
    );
    expect(res.status).toBe(401);
  });

  it("GET returns own rows only, keyed on the session user", async () => {
    mockSession({ id: "staff-1", name: "S", role: "staff" });
    const rows = [
      { weekday: 1, available: true, startTime: "09:00", endTime: "15:00", note: null },
    ];
    prismaMock.staffAvailability.findMany.mockResolvedValue(rows);

    const res = await GET(createRequest("GET", URL_PATH));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.availability).toEqual(rows);

    const call = prismaMock.staffAvailability.findMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({ userId: "staff-1" });
  });

  it("PUT 400 when a weekday is out of range", async () => {
    mockSession({ id: "staff-1", name: "S", role: "staff" });
    const entries = fullWeek();
    entries[6] = { ...entries[6], weekday: 7 };
    const res = await PUT(
      createRequest("PUT", URL_PATH, { body: { availability: entries } }),
    );
    expect(res.status).toBe(400);
  });

  it("PUT 400 when weekdays are not unique", async () => {
    mockSession({ id: "staff-1", name: "S", role: "staff" });
    const entries = fullWeek();
    entries[6] = { ...entries[6], weekday: 5 }; // 5 appears twice
    const res = await PUT(
      createRequest("PUT", URL_PATH, { body: { availability: entries } }),
    );
    expect(res.status).toBe(400);
  });

  it("PUT 400 when the set is not exactly 7 entries", async () => {
    mockSession({ id: "staff-1", name: "S", role: "staff" });
    const res = await PUT(
      createRequest("PUT", URL_PATH, {
        body: { availability: fullWeek().slice(0, 5) },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("PUT 400 on a malformed time string", async () => {
    mockSession({ id: "staff-1", name: "S", role: "staff" });
    const res = await PUT(
      createRequest("PUT", URL_PATH, {
        body: {
          availability: fullWeek({ 1: { startTime: "9am", endTime: "15:00" } }),
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("PUT 400 when endTime is not after startTime", async () => {
    mockSession({ id: "staff-1", name: "S", role: "staff" });
    const res = await PUT(
      createRequest("PUT", URL_PATH, {
        body: {
          availability: fullWeek({
            2: { startTime: "15:00", endTime: "09:00" },
          }),
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("PUT 400 when times are set on an unavailable day", async () => {
    mockSession({ id: "staff-1", name: "S", role: "staff" });
    const res = await PUT(
      createRequest("PUT", URL_PATH, {
        body: {
          availability: fullWeek({
            0: { available: false, startTime: "09:00", endTime: "15:00" },
          }),
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("PUT happy path: full-replaces own rows in a transaction and returns the new set", async () => {
    mockSession({ id: "staff-1", name: "S", role: "staff" });
    const stored = fullWeek({ 3: { startTime: "09:00", endTime: "15:00" } });
    prismaMock.staffAvailability.findMany.mockResolvedValue(stored);

    const res = await PUT(
      createRequest("PUT", URL_PATH, {
        body: {
          availability: fullWeek({
            3: { startTime: "09:00", endTime: "15:00", note: "school run" },
          }),
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.availability).toEqual(stored);

    // Delete is scoped to self.
    const delCall = prismaMock.staffAvailability.deleteMany.mock.calls[0]?.[0];
    expect(delCall.where).toEqual({ userId: "staff-1" });

    // createMany writes 7 rows, all stamped with the session userId.
    const createCall =
      prismaMock.staffAvailability.createMany.mock.calls[0]?.[0];
    expect(createCall.data).toHaveLength(7);
    expect(createCall.data.every((r: { userId: string }) => r.userId === "staff-1")).toBe(true);
    const wednesday = createCall.data.find(
      (r: { weekday: number }) => r.weekday === 3,
    );
    expect(wednesday).toMatchObject({
      available: true,
      startTime: "09:00",
      endTime: "15:00",
      note: "school run",
    });
  });
});
