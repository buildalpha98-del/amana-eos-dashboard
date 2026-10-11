import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
vi.mock("@/lib/notifications/attendance", () => ({
  sendSignInNotification: vi.fn(async () => {}),
  sendSignOutNotification: vi.fn(async () => {}),
}));
import { recordDeparture, type HandoverInput } from "@/lib/attendance-handover";
import { prisma } from "@/lib/prisma";
const arrival = new Date("2026-10-12T04:00:00Z");
const input: HandoverInput = {
  childId: "c1",
  serviceId: "s1",
  date: new Date("2026-10-12T00:00:00Z"),
  sessionType: "asc",
  action: "sign_out",
  at: new Date("2026-10-12T06:00:00Z"),
  recordedById: "u1",
  signedByName: "Test Collector",
};
beforeEach(() => vi.clearAllMocks());
describe("recording collection", () => {
  it.each([
    null,
    { id: "r1", signInTime: null, signOutTime: null },
    {
      id: "r1",
      signInTime: new Date("2026-10-12T07:00:00Z"),
      signOutTime: null,
    },
  ])(
    "refuses missing or later arrivals without inserting a record",
    async (row) => {
      prismaMock.attendanceRecord.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.attendanceRecord.findUnique.mockResolvedValue(row);
      await expect(recordDeparture(prisma, input)).rejects.toMatchObject({
        status: 409,
      });
      expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
      expect(prismaMock.attendanceRecord.create).not.toHaveBeenCalled();
    },
  );
  it("records collection conditionally without changing arrival", async () => {
    const row = { id: "r1", signInTime: arrival, signOutTime: input.at };
    prismaMock.attendanceRecord.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue(row);
    expect(await recordDeparture(prisma, input)).toEqual({
      record: row,
      changed: true,
    });
    const args = prismaMock.attendanceRecord.updateMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      childId: "c1",
      serviceId: "s1",
      signInTime: { not: null, lte: input.at },
      signOutTime: null,
    });
    expect(args.data).toEqual({
      signOutTime: input.at,
      signedOutById: "u1",
      signedOutByName: "Test Collector",
    });
  });
  it("returns the original collection on retry without overwriting it", async () => {
    const row = {
      id: "r1",
      signInTime: arrival,
      signOutTime: input.at,
      signedOutByName: "Original collector",
    };
    prismaMock.attendanceRecord.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue(row);
    expect(
      await recordDeparture(prisma, {
        ...input,
        at: new Date(input.at.getTime() + 60000),
      }),
    ).toEqual({ record: row, changed: false });
  });
});
