import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockArrivalRecords } from "../helpers/attendance-arrival-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
}));
vi.mock("@/lib/notifications/attendance", () => ({
  sendSignInNotification: vi.fn(async () => {}),
  sendSignOutNotification: vi.fn(async () => {}),
}));
import {
  sendSignInNotification,
  sendSignOutNotification,
} from "@/lib/notifications/attendance";
import { POST } from "@/app/api/attendance/roll-call/route";
import { POST as BULK } from "@/app/api/attendance/roll-call/bulk/route";

const base = {
  childId: "c1",
  serviceId: "s1",
  date: "2026-10-12",
  sessionType: "asc" as const,
};
const arrival = new Date("2026-10-12T04:00:00Z");
const original = {
  ...base,
  date: new Date("2026-10-12T00:00:00Z"),
  id: "r1",
  status: "present" as const,
  signInTime: arrival,
  signedInById: "first-educator",
  signedInByName: "Original adult",
  notes: "Original note",
};
const post = (data: Record<string, unknown> = {}) =>
  POST(
    createRequest("POST", "/api/attendance/roll-call", {
      body: { ...base, action: "sign_in", ...data },
    }),
  );
const bulk = (items: Record<string, unknown>[]) =>
  BULK(
    createRequest("POST", "/api/attendance/roll-call/bulk", {
      body: { serviceId: "s1", notify: true, items },
    }),
  );
beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.child.findFirst.mockImplementation(
    async ({ where }: { where: { id: string; serviceId: string } }) =>
      where.id === "c1" && where.serviceId === "s1" ? { id: "c1" } : null,
  );
  prismaMock.child.findMany.mockResolvedValue([{ id: "c1" }]);
  prismaMock.attendanceRecord.groupBy.mockResolvedValue([]);
  prismaMock.dailyAttendance.upsert.mockResolvedValue({});
  mockArrivalRecords();
  mockSession({ id: "u1", name: "Educator", role: "staff", serviceId: "s1" });
});

describe("child and centre boundaries", () => {
  for (const role of ["staff", "member", "owner"] as const) {
    it.each(["sign_in", "sign_out", "mark_absent", "undo", "note"])(
      `${role} cannot attach another centre's child through %s`,
      async (action) => {
        mockSession({ id: "u1", name: "Test", role, serviceId: "s1" });
        expect((await post({ childId: "other-child", action })).status).toBe(
          404,
        );
        expect(prismaMock.child.findFirst).toHaveBeenCalledWith({
          where: { id: "other-child", serviceId: "s1" },
          select: { id: true },
        });
        expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
        expect(prismaMock.attendanceRecord.createMany).not.toHaveBeenCalled();
        expect(prismaMock.attendanceRecord.updateMany).not.toHaveBeenCalled();
        expect(prismaMock.attendanceRecord.update).not.toHaveBeenCalled();
        expect(prismaMock.dailyAttendance.upsert).not.toHaveBeenCalled();
      },
    );
  }
  it("rejects an entire mixed-centre batch before the first attendance write", async () => {
    expect(
      (
        await bulk([
          { ...base, action: "sign_in" },
          { ...base, childId: "other-child", action: "undo" },
        ])
      ).status,
    ).toBe(404);
    expect(prismaMock.child.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["c1", "other-child"] }, serviceId: "s1" },
      select: { id: true },
    });
    expect(prismaMock.attendanceRecord.createMany).not.toHaveBeenCalled();
    expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
    expect(sendSignInNotification).not.toHaveBeenCalled();
  });
});

describe("first arrival is preserved", () => {
  it("keeps arrival, actor and notes on repeat sign-in, without sending another notification", async () => {
    mockArrivalRecords([original]);
    const res = await post({ notes: "New note" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      signInTime: arrival.toISOString(),
      signedInById: "first-educator",
      notes: "Original note",
    });
    expect(sendSignInNotification).not.toHaveBeenCalled();
    expect(prismaMock.attendanceRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ signInTime: null, signOutTime: null }),
      }),
    );
  });
  it("does not reopen a collected child when an old arrival is retried", async () => {
    const departure = new Date("2026-10-12T06:00:00Z");
    mockArrivalRecords([{ ...original, signOutTime: departure }]);
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      signInTime: arrival.toISOString(),
      signOutTime: departure.toISOString(),
    });
    expect(sendSignInNotification).not.toHaveBeenCalled();
  });
  it("only one concurrent tap records an arrival and sends a notification", async () => {
    const responses = await Promise.all([post(), post()]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const records = await Promise.all(responses.map((r) => r.json()));
    expect(records[0]).toEqual(records[1]);
    expect(sendSignInNotification).toHaveBeenCalledTimes(1);
  });
  it("signs an existing unarrived booking in and clears its old absence reason", async () => {
    mockArrivalRecords([
      {
        ...original,
        signInTime: null,
        signOutTime: null,
        status: "absent",
        absenceReason: "Unwell",
      },
    ]);
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "present",
      absenceReason: null,
      signedInById: "u1",
    });
    expect(sendSignInNotification).toHaveBeenCalledTimes(1);
  });
  it("refuses an inconsistent departure-only record instead of inventing an arrival", async () => {
    mockArrivalRecords([
      { ...original, signInTime: null, signOutTime: new Date() },
    ]);
    expect((await post()).status).toBe(409);
    expect(sendSignInNotification).not.toHaveBeenCalled();
  });
  it("bulk retries preserve the first arrival and notify only on the first write", async () => {
    const items = [
      { ...base, action: "sign_in" },
      { ...base, action: "sign_in" },
    ];
    expect((await bulk(items)).status).toBe(200);
    expect((await bulk(items)).status).toBe(200);
    expect(sendSignInNotification).toHaveBeenCalledTimes(1);
  });
  it("bulk collection retries do not resend the departure notification", async () => {
    prismaMock.attendanceRecord.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue({
      ...original,
      signOutTime: new Date(),
    });
    expect((await bulk([{ ...base, action: "sign_out" }])).status).toBe(200);
    expect(sendSignOutNotification).not.toHaveBeenCalled();
  });
});
