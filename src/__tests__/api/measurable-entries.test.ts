/**
 * Tests for /api/measurables/[id]/entries POST + DELETE.
 *
 * DELETE was added 2026-06-02 to fix a UX bug where bogus values
 * (e.g. -18 for revenue) couldn't be cleared from the scorecard —
 * the old contract had no way to remove an entry.
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
  generateRequestId: () => "test-req",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import {
  POST,
  DELETE,
} from "@/app/api/measurables/[id]/entries/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({
    active: true,
    serviceId: "svc-1",
  });
  prismaMock.activityLog.create.mockResolvedValue({} as never);
});

describe("DELETE /api/measurables/[id]/entries", () => {
  it("rejects unauthenticated", async () => {
    mockNoSession();
    const res = await DELETE(
      createRequest("DELETE", "/api/measurables/m-1/entries?weekOf=2026-05-19"),
      { params: Promise.resolve({ id: "m-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when weekOf missing", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.measurable.findUnique.mockResolvedValue({ id: "m-1" });
    const res = await DELETE(
      createRequest("DELETE", "/api/measurables/m-1/entries"),
      { params: Promise.resolve({ id: "m-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when measurable doesn't exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.measurable.findUnique.mockResolvedValue(null);
    const res = await DELETE(
      createRequest("DELETE", "/api/measurables/ghost/entries?weekOf=2026-05-19"),
      { params: Promise.resolve({ id: "ghost" }) },
    );
    expect(res.status).toBe(404);
  });

  it("deletes the entry + logs the action", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.measurable.findUnique.mockResolvedValue({ id: "m-1" });
    prismaMock.measurableEntry.delete.mockResolvedValue({});
    const res = await DELETE(
      createRequest("DELETE", "/api/measurables/m-1/entries?weekOf=2026-05-19"),
      { params: Promise.resolve({ id: "m-1" }) },
    );
    expect(res.status).toBe(200);
    expect(prismaMock.measurableEntry.delete).toHaveBeenCalled();
    const log = prismaMock.activityLog.create.mock.calls[0]?.[0];
    expect(log?.data.action).toBe("entry_clear");
  });

  it("is idempotent — P2025 (record not found) returns 200", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.measurable.findUnique.mockResolvedValue({ id: "m-1" });
    prismaMock.measurableEntry.delete.mockRejectedValue({
      code: "P2025",
      message: "Record to delete does not exist",
    });
    const res = await DELETE(
      createRequest("DELETE", "/api/measurables/m-1/entries?weekOf=2026-05-19"),
      { params: Promise.resolve({ id: "m-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("propagates non-P2025 errors", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.measurable.findUnique.mockResolvedValue({ id: "m-1" });
    prismaMock.measurableEntry.delete.mockRejectedValue(
      new Error("DB timeout"),
    );
    const res = await DELETE(
      createRequest("DELETE", "/api/measurables/m-1/entries?weekOf=2026-05-19"),
      { params: Promise.resolve({ id: "m-1" }) },
    );
    expect(res.status).toBe(500);
  });

  it("normalises weekOf to UTC midnight before deleting", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.measurable.findUnique.mockResolvedValue({ id: "m-1" });
    prismaMock.measurableEntry.delete.mockResolvedValue({});
    await DELETE(
      createRequest(
        "DELETE",
        "/api/measurables/m-1/entries?weekOf=2026-05-19T15:30:00.000Z",
      ),
      { params: Promise.resolve({ id: "m-1" }) },
    );
    const call = prismaMock.measurableEntry.delete.mock.calls[0]?.[0];
    const weekOf = call?.where?.measurableId_weekOf?.weekOf as Date;
    expect(weekOf.getUTCHours()).toBe(0);
    expect(weekOf.getUTCMinutes()).toBe(0);
    expect(weekOf.getUTCSeconds()).toBe(0);
  });
});

describe("POST /api/measurables/[id]/entries — sanity", () => {
  // Re-cover the happy path so a future refactor of the route file
  // doesn't accidentally drop POST.
  it("creates/upserts an entry", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.measurable.findUnique.mockResolvedValue({
      id: "m-1",
      goalValue: 100,
      goalDirection: "above",
    });
    prismaMock.measurableEntry.upsert.mockResolvedValue({
      id: "e-1",
      value: 120,
      onTrack: true,
    });
    const res = await POST(
      createRequest("POST", "/api/measurables/m-1/entries", {
        body: { weekOf: "2026-05-19", value: 120 },
      }),
      { params: Promise.resolve({ id: "m-1" }) },
    );
    expect(res.status).toBe(201);
  });
});
