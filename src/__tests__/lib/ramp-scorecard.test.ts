import { describe, it, expect } from "vitest";
import { buildRampScorecard, ratingAverage, stageForDay, type RampScorecardInputs } from "@/lib/ramp/scorecard";
import { addDays } from "@/lib/ramp/dates";

const start = new Date(Date.UTC(2026, 8, 1));

function inputs(overrides: Partial<RampScorecardInputs> = {}): RampScorecardInputs {
  return {
    ramp: { startDate: start, endDate: addDays(start, 90), status: "active" },
    checkIns: [],
    checkpoints: [],
    essentialCourses: 4,
    essentialCompleted: 4,
    wwccOnFile: true,
    requiredPolicies: 2,
    policiesAcked: 2,
    shiftsWorked: 10,
    clockedShifts: 10,
    onTimeShifts: 10,
    ...overrides,
  };
}

const checkIn = (week: number, mood: number | null, extra: Partial<RampScorecardInputs["checkIns"][number]> = {}) => ({
  weekNumber: week,
  sentAt: new Date(),
  skipped: false,
  submittedAt: mood == null ? null : new Date(),
  mood,
  flaggedAt: null,
  ...extra,
});

describe("stageForDay / ratingAverage", () => {
  it("picks the latest reached stage, defaulting to 30", () => {
    expect(stageForDay(0)).toBe(30);
    expect(stageForDay(59)).toBe(30);
    expect(stageForDay(60)).toBe(60);
    expect(stageForDay(120)).toBe(90);
  });

  it("averages only valid competency ratings", () => {
    expect(ratingAverage({ child_safety: 4, ratios: 3, junk: 9 })).toBe(3.5);
    expect(ratingAverage({})).toBeNull();
    expect(ratingAverage(null)).toBeNull();
  });
});

describe("buildRampScorecard", () => {
  it("nothing is 'behind' before day 30 — unmet rows are pending", () => {
    const sc = buildRampScorecard(inputs({ shiftsWorked: 1, wwccOnFile: false }), addDays(start, 10));
    expect(sc.day).toBe(10);
    expect(sc.stage).toBe(30);
    expect(sc.rows.find((r) => r.key === "wwcc")?.status).toBe("pending");
    expect(sc.rows.find((r) => r.key === "training")?.status).toBe("met");
    expect(sc.overall).toBe("on_track");
  });

  it("flags rows behind their stage target once the stage is reached", () => {
    const sc = buildRampScorecard(inputs({ shiftsWorked: 5, essentialCompleted: 2 }), addDays(start, 35));
    const shifts = sc.rows.find((r) => r.key === "shifts")!;
    expect(shifts.target).toBe(8);
    expect(shifts.status).toBe("behind");
    expect(sc.rows.find((r) => r.key === "training")?.value).toBe(50);
    expect(sc.overall).toBe("needs_support"); // two rows behind
  });

  it("uses the day-60 targets from day 60", () => {
    const sc = buildRampScorecard(inputs({ shiftsWorked: 12 }), addDays(start, 61));
    const shifts = sc.rows.find((r) => r.key === "shifts")!;
    expect(shifts.target).toBe(16);
    expect(shifts.status).toBe("behind");
  });

  it("check-in response rate ignores skipped rows and mood trend uses the last three", () => {
    const sc = buildRampScorecard(
      inputs({
        checkIns: [
          checkIn(1, null, { skipped: true, sentAt: new Date() }),
          checkIn(2, 2),
          checkIn(3, 5),
          checkIn(4, 4),
          checkIn(5, 3),
          checkIn(6, null),
        ],
      }),
      addDays(start, 45),
    );
    expect(sc.rows.find((r) => r.key === "checkins")?.value).toBe(80); // 4 of 5 sent
    expect(sc.rows.find((r) => r.key === "mood")?.value).toBe(4); // (5+4+3)/3
    expect(sc.lastMood).toBe(3);
  });

  it("a flagged check-in in the last 14 days makes the ramp at_risk", () => {
    const now = addDays(start, 20);
    const sc = buildRampScorecard(
      inputs({ checkIns: [checkIn(2, 1, { flaggedAt: addDays(now, -3) })] }),
      now,
    );
    expect(sc.recentFlags).toBe(1);
    expect(sc.overall).toBe("at_risk");
  });

  it("an old flag no longer counts", () => {
    const now = addDays(start, 40);
    const sc = buildRampScorecard(inputs({ checkIns: [checkIn(1, 1, { flaggedAt: addDays(now, -20) })] }), now);
    expect(sc.recentFlags).toBe(0);
    expect(sc.overall).toBe("on_track");
  });

  it("manager row reads the latest submitted checkpoint and its recommendation drives overall", () => {
    const sc = buildRampScorecard(
      inputs({
        checkpoints: [
          { day: 30, submittedAt: new Date(), ratings: { child_safety: 3, ratios: 3, programming: 3, families: 3, teamwork: 3, reliability: 3 }, recommendation: "on_track" },
          { day: 60, submittedAt: new Date(), ratings: { child_safety: 2, ratios: 2, programming: 2, families: 2, teamwork: 2, reliability: 2 }, recommendation: "needs_support" },
          { day: 90, submittedAt: null, ratings: {}, recommendation: null },
        ],
      }),
      addDays(start, 65),
    );
    const mgr = sc.rows.find((r) => r.key === "manager")!;
    expect(mgr.value).toBe(2);
    expect(mgr.target).toBe(3.5);
    expect(mgr.status).toBe("behind");
    expect(sc.latestCheckpoint).toEqual({ day: 60, recommendation: "needs_support", average: 2 });
    expect(sc.overall).toBe("needs_support");
  });

  it("manager row is pending (not behind) while no checkpoint has been submitted", () => {
    const sc = buildRampScorecard(inputs(), addDays(start, 40));
    expect(sc.rows.find((r) => r.key === "manager")?.status).toBe("pending");
  });

  it("no published essentials / policies count as 100%", () => {
    const sc = buildRampScorecard(inputs({ essentialCourses: 0, essentialCompleted: 0, requiredPolicies: 0, policiesAcked: 0 }), addDays(start, 40));
    expect(sc.rows.find((r) => r.key === "training")?.status).toBe("met");
    expect(sc.rows.find((r) => r.key === "policies")?.status).toBe("met");
  });
});
