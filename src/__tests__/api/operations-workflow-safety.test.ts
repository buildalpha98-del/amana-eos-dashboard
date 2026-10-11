// Regression scenarios from the 12 October operational review.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({
    limited: false,
    remaining: 59,
    resetIn: 60000,
  })),
}));
vi.mock("@/lib/notifications/attendance", () => ({
  sendSignInNotification: vi.fn(async () => {}),
  sendSignOutNotification: vi.fn(async () => {}),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "audit-probe",
}));
import { _clearUserActiveCache } from "@/lib/server-auth";
import {
  GET as readChecklist,
  PATCH as patchChecklist,
} from "@/app/api/services/[id]/checklists/[checklistId]/route";
import {
  GET as readMeds,
  POST as logDose,
} from "@/app/api/services/[id]/medications/route";
import { GET as dashboard } from "@/app/api/services/[id]/dashboard/route";
import { Prisma } from "@prisma/client";
import { POST as bulkAttendance } from "@/app/api/attendance/roll-call/bulk/route";
import { recordHandover } from "@/lib/attendance-handover";
const ctx = (id = "s1") => ({
  params: Promise.resolve({ id, checklistId: "check-1" }),
});
describe("OSHC workflow safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    mockSession({ id: "u1", name: "Educator", role: "staff", serviceId: "s1" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });
  afterEach(() => vi.useRealTimers());
  it("refuses checklist reads from another centre", async () => {
    prismaMock.dailyChecklist.findFirst.mockResolvedValue({
      id: "check-1",
      serviceId: "s2",
      items: [],
    });
    const response = await readChecklist(
      createRequest("GET", "/api/services/s2/checklists/check-1"),
      ctx("s2"),
    );
    expect(response.status).toBe(403);
  });
  it("reopens a completed checklist when a required item is unticked", async () => {
    const row = {
      id: "check-1",
      serviceId: "s1",
      status: "completed",
      completedAt: new Date(),
      completedById: "u1",
      items: [{ id: "item-1", checked: true, isRequired: true }],
    };
    prismaMock.dailyChecklist.findFirst.mockResolvedValue(row);
    prismaMock.dailyChecklistItem.update.mockImplementation(async () => {
      row.items[0].checked = false;
      return row.items[0];
    });
    prismaMock.dailyChecklist.findUnique.mockImplementation(async () => row);
    prismaMock.dailyChecklist.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(row, data);
        return row;
      },
    );
    const response = await patchChecklist(
      createRequest("PATCH", "/api/services/s1/checklists/check-1", {
        body: { itemId: "item-1", checked: false },
      }),
      ctx(),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).checklist.status).not.toBe("completed");
  });
  it("uses the Sydney day for medication records on a UTC host", async () => {
    prismaMock.medicationAdministration.findMany.mockResolvedValue([]);
    await readMeds(
      createRequest("GET", "/api/services/s1/medications?date=2026-10-12"),
      ctx(),
    );
    const args = prismaMock.medicationAdministration.findMany.mock.calls[0][0];
    expect(args.where.administeredAt.gte.toISOString()).toBe(
      "2026-10-11T13:00:00.000Z",
    );
  });
  it("does not return another centre medication record on replay", async () => {
    prismaMock.medicationAdministration.findUnique.mockResolvedValue({
      id: "dose-other",
      serviceId: "s2",
      childId: "cjotherchildddddddddddddd",
    });
    const response = await logDose(
      createRequest("POST", "/api/services/s1/medications", {
        body: {
          childId: "cjabcdefghijklmnopqrstuvw",
          medicationName: "Synthetic medication",
          dose: "Test dose",
          route: "oral",
          administeredAt: "2026-10-12T04:00:00Z",
          clientMutationId: "550e8400-e29b-41d4-a716-446655440000",
        },
      }),
      ctx(),
    );
    expect(response.status).not.toBe(200);
  });
  it("counts one person once across overlapping shift rows in Today", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-12T16:00:00+11:00"));
    prismaMock.orgSettings.findUnique.mockResolvedValue(null);
    prismaMock.service.findUnique.mockResolvedValue({
      id: "s1",
      name: "Synthetic",
      code: "TEST",
      capacity: 30,
      sessionTimes: null,
      ratioSettings: { asc: { ratio: "1:15" } },
    });
    prismaMock.attendanceRecord.findMany.mockResolvedValue(
      Array.from({ length: 16 }, (_, i) => ({
        childId: `c${i}`,
        sessionType: "asc",
        status: "present",
        signInTime: new Date(),
        signOutTime: null,
        child: { id: `c${i}`, firstName: "Test", surname: String(i) },
      })),
    );
    prismaMock.rosterShift.findMany.mockResolvedValue(
      ["a", "b"].map((id) => ({
        id,
        status: "published",
        staffName: "Same educator",
        sessionType: "asc",
        shiftStart: "14:00",
        shiftEnd: "18:00",
        actualStart: new Date(),
        actualEnd: null,
        user: {
          id: "u1",
          name: "Same educator",
          avatar: null,
          active: true,
          isCentreAccount: false,
          excludeFromRatio: false,
        },
      })),
    );
    const response = await dashboard(
      createRequest("GET", "/api/services/s1/dashboard"),
      ctx(),
    );
    const asc = (await response.json()).programmes.find(
      (p: { key: string }) => p.key === "asc",
    );
    expect(asc.staffClockedIn).toBe(1);
    expect(asc.inRatio).toBe(false);
  });
  it("does not invent a sign-in timestamp when collecting a child with no arrival record", async () => {
    prismaMock.attendanceRecord.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue(null);
    await expect(
      recordHandover({
        childId: "child",
        serviceId: "s1",
        date: new Date("2026-10-12T00:00:00Z"),
        sessionType: "asc",
        action: "sign_out",
        at: new Date("2026-10-12T06:00:00Z"),
        recordedById: "u1",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
  });
  it.each(["staff", "member"] as const)(
    "protects checklist reads and writes for %s accounts",
    async (role) => {
      mockSession({
        id: "u1",
        name: "Test",
        role,
        serviceId: "s1",
        isCentreAccount: role === "member",
      });
      expect(
        (
          await readChecklist(
            createRequest("GET", "/api/services/s2/checklists/check-1"),
            ctx("s2"),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await patchChecklist(
            createRequest("PATCH", "/api/services/s2/checklists/check-1", {
              body: { status: "completed" },
            }),
            ctx("s2"),
          )
        ).status,
      ).toBe(403);
      expect(prismaMock.dailyChecklist.findFirst).not.toHaveBeenCalled();
    },
  );
  it("allows office checklist access and returns 404 for missing records", async () => {
    mockSession({ id: "office", name: "Office", role: "admin" });
    prismaMock.dailyChecklist.findFirst.mockResolvedValue(null);
    expect(
      (
        await readChecklist(
          createRequest("GET", "/api/services/s2/checklists/check-1"),
          ctx("s2"),
        )
      ).status,
    ).toBe(404);
  });
  it("rejects manual completion with required checks outstanding", async () => {
    const row = {
      id: "check-1",
      serviceId: "s1",
      status: "pending",
      items: [{ id: "item-1", isRequired: true, checked: false }],
    };
    prismaMock.dailyChecklist.findFirst.mockResolvedValue(row);
    prismaMock.dailyChecklist.findUnique.mockResolvedValue(row);
    const res = await patchChecklist(
      createRequest("PATCH", "/api/services/s1/checklists/check-1", {
        body: { status: "completed" },
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.dailyChecklist.update).not.toHaveBeenCalled();
  });
  it("clears attribution when a checked item is toggled without an explicit value", async () => {
    const row = {
      id: "check-1",
      serviceId: "s1",
      status: "completed",
      completedAt: new Date(),
      completedById: "u1",
      items: [{ id: "item-1", checked: true, isRequired: true }],
    };
    prismaMock.dailyChecklist.findFirst.mockResolvedValue(row);
    prismaMock.dailyChecklistItem.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(row.items[0], data);
        return row.items[0];
      },
    );
    prismaMock.dailyChecklist.findUnique.mockImplementation(async () => row);
    prismaMock.dailyChecklist.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(row, data);
        return row;
      },
    );
    expect(
      (
        await patchChecklist(
          createRequest("PATCH", "/api/services/s1/checklists/check-1", {
            body: { itemId: "item-1" },
          }),
          ctx(),
        )
      ).status,
    ).toBe(200);
    expect(prismaMock.dailyChecklistItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { checked: false, checkedAt: null, checkedById: null },
    });
    expect(row).toMatchObject({
      status: "pending",
      completedAt: null,
      completedById: null,
    });
  });
  it("rejects unsupported checklist statuses", async () => {
    expect(
      (
        await patchChecklist(
          createRequest("PATCH", "/api/services/s1/checklists/check-1", {
            body: { status: "anything" },
          }),
          ctx(),
        )
      ).status,
    ).toBe(400);
  });
  it("rejects missing arrival in a bulk collection and does not update totals", async () => {
    prismaMock.attendanceRecord.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.attendanceRecord.findUnique.mockResolvedValue(null);
    const res = await bulkAttendance(
      createRequest("POST", "/api/attendance/roll-call/bulk", {
        body: {
          serviceId: "s1",
          items: [
            {
              childId: "child",
              date: "2026-10-12",
              sessionType: "asc",
              action: "sign_out",
            },
          ],
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
    expect(prismaMock.dailyAttendance.upsert).not.toHaveBeenCalled();
  });
  it.each([
    ["2026-10-04", "2026-10-03T14:00:00.000Z", "2026-10-04T13:00:00.000Z"],
    ["2026-04-05", "2026-04-04T13:00:00.000Z", "2026-04-05T14:00:00.000Z"],
  ])(
    "queries the complete Sydney medication day through DST on %s",
    async (date, start, end) => {
      prismaMock.medicationAdministration.findMany.mockResolvedValue([]);
      const res = await readMeds(
        createRequest("GET", `/api/services/s1/medications?date=${date}`),
        ctx(),
      );
      expect(res.status).toBe(200);
      const window =
        prismaMock.medicationAdministration.findMany.mock.calls[0][0].where
          .administeredAt;
      expect(window.gte.toISOString()).toBe(start);
      expect(window.lt.toISOString()).toBe(end);
    },
  );
  it.each(["2026-02-30", "not-a-date", "2026-13-01"])(
    "rejects invalid medication date %s",
    async (date) => {
      expect(
        (
          await readMeds(
            createRequest("GET", `/api/services/s1/medications?date=${date}`),
            ctx(),
          )
        ).status,
      ).toBe(400);
      expect(
        prismaMock.medicationAdministration.findMany,
      ).not.toHaveBeenCalled();
    },
  );
  it("defaults medication history to Sydney today on a UTC morning boundary", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-11T20:00:00Z"));
    prismaMock.medicationAdministration.findMany.mockResolvedValue([]);
    const response = await readMeds(
      createRequest("GET", "/api/services/s1/medications"),
      ctx(),
    );
    expect((await response.json()).date).toBe("2026-10-12");
    expect(
      prismaMock.medicationAdministration.findMany.mock.calls[0][0].where.administeredAt.gte.toISOString(),
    ).toBe("2026-10-11T13:00:00.000Z");
  });

  const doseInput = {
    childId: "cjabcdefghijklmnopqrstuvw",
    medicationName: "Synthetic medication",
    dose: "Test dose",
    route: "oral",
    administeredAt: "2026-10-12T04:00:00Z",
    clientMutationId: "550e8400-e29b-41d4-a716-446655440000",
  };
  const savedDose = {
    ...doseInput,
    id: "dose",
    serviceId: "s1",
    administeredById: "u1",
    administeredAt: new Date(doseInput.administeredAt),
    witnessedById: null,
    parentConsentUrl: null,
    notes: null,
  };
  it.each([
    { childId: "another-child" },
    { administeredById: "another-user" },
    { dose: "changed" },
    { notes: "changed" },
    { administeredAt: new Date("2026-10-12T05:00:00Z") },
  ])("rejects conflicting medication replays: %j", async (changes) => {
    prismaMock.medicationAdministration.findUnique.mockResolvedValue({
      ...savedDose,
      ...changes,
    });
    const res = await logDose(
      createRequest("POST", "/api/services/s1/medications", {
        body: doseInput,
      }),
      ctx(),
    );
    expect(res.status).toBe(409);
    expect(prismaMock.medicationAdministration.create).not.toHaveBeenCalled();
  });
  it.each(["s1", "s2"])(
    "rechecks centre access after a concurrent medication insert from %s",
    async (serviceId) => {
      let raced = false;
      prismaMock.medicationAdministration.findUnique.mockImplementation(
        async () => (raced ? { ...savedDose, serviceId } : null),
      );
      prismaMock.child.findFirst.mockResolvedValue({ id: doseInput.childId });
      prismaMock.medicationAdministration.create.mockImplementation(
        async () => {
          raced = true;
          throw new Prisma.PrismaClientKnownRequestError("Unique key", {
            code: "P2002",
            clientVersion: "5.22.0",
          });
        },
      );
      const res = await logDose(
        createRequest("POST", "/api/services/s1/medications", {
          body: doseInput,
        }),
        ctx(),
      );
      expect(res.status).toBe(serviceId === "s1" ? 200 : 403);
      expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
    },
  );

  it("retries a concurrent checklist edit from a fresh transaction snapshot", async () => {
    const row = {
      id: "check-1",
      serviceId: "s1",
      status: "in_progress",
      items: [{ id: "item-1", checked: true, isRequired: true }],
    };
    let reads = 0;
    prismaMock.dailyChecklist.findFirst.mockImplementation(async () => {
      reads++;
      if (reads === 1)
        throw new Prisma.PrismaClientKnownRequestError("Concurrent edit", {
          code: "P2034",
          clientVersion: "5.22.0",
        });
      return row;
    });
    prismaMock.dailyChecklist.findUnique.mockImplementation(async () => row);
    prismaMock.dailyChecklist.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(row, data);
        return row;
      },
    );
    expect(
      (
        await patchChecklist(
          createRequest("PATCH", "/api/services/s1/checklists/check-1", {
            body: { status: "completed" },
          }),
          ctx(),
        )
      ).status,
    ).toBe(200);
    expect(reads).toBe(2);
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(row).toMatchObject({ status: "completed", completedById: "u1" });
  });
  it("returns a useful conflict when concurrent checklist changes exhaust retries", async () => {
    prismaMock.dailyChecklist.findFirst.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Concurrent edit", {
        code: "P2034",
        clientVersion: "5.22.0",
      }),
    );
    const response = await patchChecklist(
      createRequest("PATCH", "/api/services/s1/checklists/check-1", {
        body: { status: "pending" },
      }),
      ctx(),
    );
    expect(response.status).toBe(409);
    expect(prismaMock.dailyChecklist.findFirst).toHaveBeenCalledTimes(3);
  });
});
