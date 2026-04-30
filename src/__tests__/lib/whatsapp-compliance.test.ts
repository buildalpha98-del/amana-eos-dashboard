import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import {
  getWeekBounds,
  getYesterdayCheckDate,
  isWeekday,
  getWeekdaysInWeek,
  formatIsoDate,
  dayLabel,
  detectTwoWeekConcerns,
  resolveCoordinatorForService,
  normalisePhoneForWaMe,
  buildWaMeLink,
  buildFlagMessage,
  tallyServiceWeek,
  COORDINATOR_WEEKLY_FLOOR,
} from "@/lib/whatsapp-compliance";

describe("getWeekBounds", () => {
  it("returns Mon→Sun spanning a Wednesday", () => {
    const wed = new Date("2026-04-22T15:00:00Z"); // Wed
    const wb = getWeekBounds(wed);
    expect(formatIsoDate(wb.start)).toBe("2026-04-20"); // Mon
    expect(formatIsoDate(wb.end)).toBe("2026-04-26"); // Sun
  });

  it("treats Monday as the week start", () => {
    const mon = new Date("2026-04-20T08:00:00Z");
    const wb = getWeekBounds(mon);
    expect(formatIsoDate(wb.start)).toBe("2026-04-20");
  });

  it("treats Sunday as the end of the previous week", () => {
    const sun = new Date("2026-04-26T23:00:00Z");
    const wb = getWeekBounds(sun);
    expect(formatIsoDate(wb.start)).toBe("2026-04-20");
    expect(formatIsoDate(wb.end)).toBe("2026-04-26");
  });
});

describe("getYesterdayCheckDate", () => {
  it("Monday → previous Friday", () => {
    const mon = new Date("2026-04-20T10:00:00Z"); // Mon
    expect(formatIsoDate(getYesterdayCheckDate(mon))).toBe("2026-04-17"); // Fri
  });

  it("Tue–Fri → previous day", () => {
    expect(formatIsoDate(getYesterdayCheckDate(new Date("2026-04-21T10:00:00Z")))).toBe("2026-04-20");
    expect(formatIsoDate(getYesterdayCheckDate(new Date("2026-04-24T10:00:00Z")))).toBe("2026-04-23");
  });

  it("Sat → previous Fri", () => {
    expect(formatIsoDate(getYesterdayCheckDate(new Date("2026-04-25T10:00:00Z")))).toBe("2026-04-24");
  });

  it("Sun → previous Fri", () => {
    expect(formatIsoDate(getYesterdayCheckDate(new Date("2026-04-26T10:00:00Z")))).toBe("2026-04-24");
  });
});

describe("isWeekday", () => {
  it("returns true for Mon–Fri", () => {
    expect(isWeekday(new Date("2026-04-20T00:00:00Z"))).toBe(true); // Mon
    expect(isWeekday(new Date("2026-04-24T00:00:00Z"))).toBe(true); // Fri
  });
  it("returns false for Sat/Sun", () => {
    expect(isWeekday(new Date("2026-04-25T00:00:00Z"))).toBe(false);
    expect(isWeekday(new Date("2026-04-26T00:00:00Z"))).toBe(false);
  });
});

describe("getWeekdaysInWeek", () => {
  it("returns 5 Mon–Fri dates", () => {
    const mon = new Date("2026-04-20T00:00:00Z");
    const days = getWeekdaysInWeek(mon);
    expect(days).toHaveLength(5);
    expect(formatIsoDate(days[0])).toBe("2026-04-20");
    expect(formatIsoDate(days[4])).toBe("2026-04-24");
  });
});

describe("dayLabel", () => {
  it("returns short label for date", () => {
    expect(dayLabel(new Date("2026-04-20T00:00:00Z"))).toBe("Mon");
    expect(dayLabel(new Date("2026-04-24T00:00:00Z"))).toBe("Fri");
  });
});

describe("detectTwoWeekConcerns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function postedRows(serviceId: string, dates: string[]) {
    return dates.map((d) => ({
      postedDate: new Date(`${d}T00:00:00Z`),
      posted: true,
      notPostingReason: null,
    }));
  }

  function leaveRow(date: string) {
    return {
      postedDate: new Date(`${date}T00:00:00Z`),
      posted: false,
      notPostingReason: "coordinator_on_leave" as const,
    };
  }

  function notPostedRow(date: string) {
    return {
      postedDate: new Date(`${date}T00:00:00Z`),
      posted: false,
      notPostingReason: null,
    };
  }

  it("flags a service that's < floor for both weeks", async () => {
    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-1", name: "Centre A" },
    ]);
    prismaMock.user.findFirst.mockResolvedValue({
      id: "u-1",
      name: "Sara",
      email: "sara@x.com",
      phone: "+61400000001",
    });
    prismaMock.whatsAppCoordinatorPost.findMany.mockImplementation(({ where }: any) => {
      const start = where.postedDate.gte as Date;
      const isThisWeek = start.toISOString().startsWith("2026-04-20");
      if (isThisWeek) {
        return Promise.resolve([
          ...postedRows("svc-1", ["2026-04-20", "2026-04-21", "2026-04-22"]),
          notPostedRow("2026-04-23"),
          notPostedRow("2026-04-24"),
        ]);
      }
      return Promise.resolve([
        ...postedRows("svc-1", ["2026-04-13", "2026-04-14", "2026-04-15"]),
        notPostedRow("2026-04-16"),
        notPostedRow("2026-04-17"),
      ]);
    });

    const concerns = await detectTwoWeekConcerns({ now: new Date("2026-04-25T10:00:00Z") });
    expect(concerns).toHaveLength(1);
    expect(concerns[0]).toMatchObject({
      serviceId: "svc-1",
      serviceName: "Centre A",
      coordinatorName: "Sara",
      thisWeekPosted: 3,
      lastWeekPosted: 3,
      reason: "two_consecutive_below_floor",
    });
  });

  it("does not flag when current week is at floor (4)", async () => {
    prismaMock.service.findMany.mockResolvedValue([{ id: "svc-1", name: "Centre A" }]);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.whatsAppCoordinatorPost.findMany.mockImplementation(({ where }: any) => {
      const start = where.postedDate.gte as Date;
      const isThisWeek = start.toISOString().startsWith("2026-04-20");
      if (isThisWeek) {
        return Promise.resolve(postedRows("svc-1", ["2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23"]));
      }
      return Promise.resolve(postedRows("svc-1", ["2026-04-13", "2026-04-14", "2026-04-15"]));
    });

    const concerns = await detectTwoWeekConcerns({ now: new Date("2026-04-25T10:00:00Z") });
    expect(concerns).toHaveLength(0);
  });

  it("excludes leave-like reasons (treats as not-counting-against)", async () => {
    prismaMock.service.findMany.mockResolvedValue([{ id: "svc-1", name: "Centre A" }]);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.whatsAppCoordinatorPost.findMany.mockImplementation(({ where }: any) => {
      const start = where.postedDate.gte as Date;
      const isThisWeek = start.toISOString().startsWith("2026-04-20");
      if (isThisWeek) {
        return Promise.resolve([
          ...postedRows("svc-1", ["2026-04-20", "2026-04-21", "2026-04-22"]),
          leaveRow("2026-04-23"),
          leaveRow("2026-04-24"),
        ]);
      }
      return Promise.resolve(postedRows("svc-1", ["2026-04-13", "2026-04-14", "2026-04-15", "2026-04-16", "2026-04-17"]));
    });

    const concerns = await detectTwoWeekConcerns({ now: new Date("2026-04-25T10:00:00Z") });
    expect(concerns).toHaveLength(0);
  });

  it("returns empty when nothing is below floor", async () => {
    prismaMock.service.findMany.mockResolvedValue([{ id: "svc-1", name: "Centre A" }]);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.whatsAppCoordinatorPost.findMany.mockResolvedValue(
      postedRows("svc-1", ["2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24"]),
    );

    const concerns = await detectTwoWeekConcerns({ now: new Date("2026-04-25T10:00:00Z") });
    expect(concerns).toHaveLength(0);
  });
});

describe("tallyServiceWeek", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts posted/not-posted/not-checked/excluded correctly", async () => {
    prismaMock.whatsAppCoordinatorPost.findMany.mockResolvedValue([
      { postedDate: new Date("2026-04-20T00:00:00Z"), posted: true, notPostingReason: null },
      { postedDate: new Date("2026-04-21T00:00:00Z"), posted: false, notPostingReason: null },
      { postedDate: new Date("2026-04-22T00:00:00Z"), posted: false, notPostingReason: "coordinator_on_leave" },
      // 2 days un-recorded
    ]);
    const tally = await tallyServiceWeek({ serviceId: "svc-1", weekStart: new Date("2026-04-20T00:00:00Z") });
    expect(tally).toEqual({ posted: 1, notPosted: 1, excluded: 1, notChecked: 2 });
  });
});

describe("resolveCoordinatorForService", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns the first coordinator user", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "u-1", name: "Sara", email: "s@x.com", phone: null });
    const c = await resolveCoordinatorForService("svc-1");
    expect(c?.id).toBe("u-1");
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ serviceId: "svc-1", role: "coordinator" }) }),
    );
  });
  it("returns null when none", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    expect(await resolveCoordinatorForService("svc-1")).toBeNull();
  });
});

describe("normalisePhoneForWaMe", () => {
  it("strips non-digits and prefixes 61 for AU local numbers", () => {
    expect(normalisePhoneForWaMe("+61 400 000 001")).toBe("61400000001");
    expect(normalisePhoneForWaMe("0400 000 001")).toBe("61400000001");
    expect(normalisePhoneForWaMe("+1 555 123 4567")).toBe("15551234567");
  });
  it("returns null for empty/undefined", () => {
    expect(normalisePhoneForWaMe("")).toBeNull();
    expect(normalisePhoneForWaMe(null)).toBeNull();
    expect(normalisePhoneForWaMe(undefined)).toBeNull();
  });
});

describe("buildWaMeLink", () => {
  it("builds a wa.me link with encoded message", () => {
    const link = buildWaMeLink("+61400000001", "hi there");
    expect(link).toBe("https://wa.me/61400000001?text=hi%20there");
  });
  it("returns null when phone is null", () => {
    expect(buildWaMeLink(null, "hi")).toBeNull();
  });
});

describe("buildFlagMessage", () => {
  it("uses one-off template", () => {
    const msg = buildFlagMessage({ context: "one_off", coordinatorName: "Sara", centreName: "Centre A", day: "Wed 22 Apr" });
    expect(msg).toContain("Sara");
    expect(msg).toContain("Centre A");
    expect(msg).toContain("Wed 22 Apr");
  });
  it("uses two-week template", () => {
    const msg = buildFlagMessage({ context: "two_week_pattern", coordinatorName: "Sara", centreName: "Centre A" });
    expect(msg).toContain("quieter couple of weeks");
  });
  it("falls back to 'there' when name missing", () => {
    const msg = buildFlagMessage({ context: "one_off", coordinatorName: null, centreName: "C" });
    expect(msg).toContain("Hey there");
  });
});

describe("constants", () => {
  it("exposes the per-coordinator floor", () => {
    expect(COORDINATOR_WEEKLY_FLOOR).toBe(4);
  });
});
