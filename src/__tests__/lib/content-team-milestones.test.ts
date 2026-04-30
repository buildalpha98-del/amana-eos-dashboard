import { describe, it, expect } from "vitest";
import {
  resolveMilestone,
  resolveAllMilestones,
  pickCurrentMilestone,
  MILESTONES,
  getResetStartDate,
} from "@/lib/content-team-milestones";

const RESET = new Date(Date.UTC(2025, 10, 3, 0, 0, 0)); // 2025-11-03

function days(n: number): Date {
  return new Date(RESET.getTime() + n * 24 * 60 * 60 * 1000);
}

describe("getResetStartDate", () => {
  it("falls back to default when env var unset", () => {
    delete process.env.MARKETING_RESET_START_DATE;
    const d = getResetStartDate();
    expect(d.toISOString().slice(0, 10)).toBe("2025-11-03");
  });
  it("uses env var when set", () => {
    process.env.MARKETING_RESET_START_DATE = "2026-01-15";
    const d = getResetStartDate();
    expect(d.toISOString().slice(0, 10)).toBe("2026-01-15");
    delete process.env.MARKETING_RESET_START_DATE;
  });
  it("ignores invalid env var", () => {
    process.env.MARKETING_RESET_START_DATE = "not-a-date";
    const d = getResetStartDate();
    expect(d.toISOString().slice(0, 10)).toBe("2025-11-03");
    delete process.env.MARKETING_RESET_START_DATE;
  });
});

describe("resolveMilestone — Day 60 (editor + designer)", () => {
  const day60 = MILESTONES.find((m) => m.key === "day60")!;

  it("on_track when day 30 with no hires", () => {
    const r = resolveMilestone(day60, [], RESET, days(30));
    expect(r.status).toBe("on_track");
    expect(r.missingRoles).toEqual(["video_editor", "designer"]);
  });

  it("at_risk when day 50 with no hires (≤14 days remain)", () => {
    const r = resolveMilestone(day60, [], RESET, days(50));
    expect(r.status).toBe("at_risk");
  });

  it("overdue when day 65 with no hires", () => {
    const r = resolveMilestone(day60, [], RESET, days(65));
    expect(r.status).toBe("overdue");
    expect(r.daysUntilTarget).toBeLessThan(0);
  });

  it("complete when both roles hired", () => {
    const members = [
      { contentTeamRole: "video_editor" as const, contentTeamStatus: "active" as const },
      { contentTeamRole: "designer" as const, contentTeamStatus: "onboarding" as const },
    ];
    const r = resolveMilestone(day60, members, RESET, days(30));
    expect(r.status).toBe("complete");
    expect(r.missingRoles).toEqual([]);
    expect(r.hiredRoles).toEqual(["video_editor", "designer"]);
  });

  it("complete when hired but not yet started (status=hired counts)", () => {
    const members = [
      { contentTeamRole: "video_editor" as const, contentTeamStatus: "hired" as const },
      { contentTeamRole: "designer" as const, contentTeamStatus: "hired" as const },
    ];
    const r = resolveMilestone(day60, members, RESET, days(30));
    expect(r.status).toBe("complete");
  });

  it("partial: editor hired, designer missing → still missing", () => {
    const members = [
      { contentTeamRole: "video_editor" as const, contentTeamStatus: "active" as const },
    ];
    const r = resolveMilestone(day60, members, RESET, days(30));
    expect(r.missingRoles).toEqual(["designer"]);
  });

  it("departed/prospect/interview do NOT count as hired", () => {
    const members = [
      { contentTeamRole: "video_editor" as const, contentTeamStatus: "departed" as const },
      { contentTeamRole: "designer" as const, contentTeamStatus: "prospect" as const },
    ];
    const r = resolveMilestone(day60, members, RESET, days(30));
    expect(r.missingRoles).toEqual(["video_editor", "designer"]);
  });
});

describe("resolveAllMilestones", () => {
  it("returns all 3 milestones with computed states", () => {
    const result = resolveAllMilestones([], days(45));
    expect(Object.keys(result.milestones)).toEqual(["day60", "day90", "day120"]);
    expect(result.milestones.day60.status).toBeDefined();
    expect(result.resetStartDate).toBe("2025-11-03");
  });
});

describe("pickCurrentMilestone", () => {
  it("returns the first incomplete milestone", () => {
    const r = resolveAllMilestones([], days(45));
    const current = pickCurrentMilestone(r.milestones);
    expect(current.key).toBe("day60");
  });
  it("returns last when all complete", () => {
    const members = [
      { contentTeamRole: "video_editor" as const, contentTeamStatus: "active" as const },
      { contentTeamRole: "designer" as const, contentTeamStatus: "active" as const },
      { contentTeamRole: "copywriter" as const, contentTeamStatus: "active" as const },
      { contentTeamRole: "community_manager" as const, contentTeamStatus: "active" as const },
    ];
    const r = resolveAllMilestones(members, days(150));
    const current = pickCurrentMilestone(r.milestones);
    expect(current.key).toBe("day120");
    expect(current.status).toBe("complete");
  });
});
