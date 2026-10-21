/** Financials → Centre breakdown (21 Oct 2026). */
import { describe, expect, it } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { centreBreakdown, periodBounds } from "@/lib/centre-breakdown";

const NOW = new Date("2026-10-21T02:00:00Z"); // Wed 21 Oct, Sydney

describe("centre breakdown", () => {
  it("periods are Sydney weeks and months", () => {
    expect(periodBounds("this_week", NOW)).toMatchObject({ label: "Week of 19 Oct" });
    expect(periodBounds("last_month", NOW).label).toBe("September 2026");
  });
  it("adds up sessions, revenue, staff, spend, margin and bank per centre", async () => {
    prismaMock.service.findMany.mockResolvedValue([
      { id: "s1", name: "Amana OSHC MFIS Greenacre", code: "MFIS-GA", state: "NSW", capacity: 40, capacityBsc: null, capacityAsc: null, capacityVc: null, bscDailyRate: 20, ascDailyRate: 40, vcDailyRate: 90, coworkFeedAt: new Date("2026-10-20T00:00:00Z"), ownaSyncedAt: null, ownaServiceId: null },
    ]);
    prismaMock.dailyAttendance.findMany.mockResolvedValue([
      { serviceId: "s1", date: new Date(), sessionType: "asc", enrolled: 25, attended: 5, absent: 2 },
      { serviceId: "s1", date: new Date(), sessionType: "bsc", enrolled: 8, attended: 2, absent: 0 },
    ]);
    prismaMock.budgetItem.findMany.mockResolvedValue([
      { serviceId: "s1", amount: 100, category: "groceries", fundedFromBank: false },
      { serviceId: "s1", amount: 65.25, category: "program_materials", fundedFromBank: false },
      { serviceId: "s1", amount: 189, category: "kitchen", fundedFromBank: true },
    ]);
    prismaMock.rosterShift.findMany.mockResolvedValue([{ serviceId: "s1", userId: "u1", date: new Date("2026-10-01T00:00:00Z"), shiftStart: "15:00", shiftEnd: "18:00" }]);
    prismaMock.employmentContract.findMany.mockResolvedValue([{ userId: "u1", payRate: 30, startDate: new Date("2026-01-01T00:00:00Z"), endDate: null }]);
    prismaMock.budgetBankEntry.groupBy.mockResolvedValue([{ serviceId: "s1", _sum: { amount: 212 } }]);
    const { rows } = await centreBreakdown("this_month", null, NOW);
    expect(rows[0]).toMatchObject({
      name: "MFIS Greenacre",
      sessions: { asc: 30, bsc: 10, total: 40, permanent: 33, casual: 7, absent: 2 },
      occupancy: 50, // 40 sessions ÷ (2 days-sessions × 40 capacity)
      revenue: 1400, // 30 × $40 + 10 × $20
      staffCost: 90, // 3h × $30
      groceries: 100,
      materials: 65.25,
      bankFunded: 189,
      bank: 212,
      dataSource: "cowork",
    });
    expect(rows[0].margin).toBeCloseTo(((1400 - 255.25) / 1400) * 100, 0);
  });
});
