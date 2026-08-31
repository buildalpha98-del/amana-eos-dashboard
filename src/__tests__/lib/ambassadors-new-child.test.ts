import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { checkNewChild } from "@/lib/ambassadors/new-child-check";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const BASE_INPUT = {
  firstName: "Zainab",
  surname: "Ali",
  dob: d("2019-03-14"),
  excludeChildIds: ["child-new"],
  enrolmentDate: d("2026-08-20"),
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.child.findMany.mockResolvedValue([]);
  prismaMock.attendanceRecord.count.mockResolvedValue(0);
  prismaMock.booking.count.mockResolvedValue(0);
});

describe("checkNewChild", () => {
  it("no matching record anywhere → new_child", async () => {
    const r = await checkNewChild(BASE_INPUT);
    expect(r.status).toBe("new_child");
  });

  it("name match with a DIFFERENT dob → new_child (different child)", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      { id: "c-1", dob: d("2017-01-01"), status: "active" },
    ]);
    const r = await checkNewChild(BASE_INPUT);
    expect(r.status).toBe("new_child");
  });

  it("match with an active enrolment → existing_child", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      { id: "c-1", dob: d("2019-03-14"), status: "active" },
    ]);
    const r = await checkNewChild(BASE_INPUT);
    expect(r.status).toBe("existing_child");
  });

  it("withdrawn match with attendance inside 6 months → existing_child", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      { id: "c-1", dob: d("2019-03-14"), status: "withdrawn" },
    ]);
    prismaMock.attendanceRecord.count.mockResolvedValue(3);
    const r = await checkNewChild(BASE_INPUT);
    expect(r.status).toBe("existing_child");
  });

  it("withdrawn match with a booking inside 6 months → existing_child", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      { id: "c-1", dob: d("2019-03-14"), status: "withdrawn" },
    ]);
    prismaMock.booking.count.mockResolvedValue(1);
    const r = await checkNewChild(BASE_INPUT);
    expect(r.status).toBe("existing_child");
  });

  it("withdrawn match, no activity in 6 months → new_child (returning family)", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      { id: "c-1", dob: d("2019-03-14"), status: "withdrawn" },
    ]);
    const r = await checkNewChild(BASE_INPUT);
    expect(r.status).toBe("new_child");
    expect(r.detail).toContain("6 months");
  });

  it("name match but missing dob on either side → uncertain (Director resolves)", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      { id: "c-1", dob: null, status: "withdrawn" },
    ]);
    const r = await checkNewChild(BASE_INPUT);
    expect(r.status).toBe("uncertain");
  });

  it("the just-created child rows are excluded from matching", async () => {
    await checkNewChild(BASE_INPUT);
    const where = prismaMock.child.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ notIn: ["child-new"] });
  });
});
