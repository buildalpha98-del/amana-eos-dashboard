import { describe, it, expect } from "vitest";
import {
  canViewScorecard,
  canManageScorecard,
  isScorecardParticipant,
} from "@/lib/scorecard-permissions";

const SCORECARD = { ownerId: "u-owner" };
const MEMBERS = ["u-member-1", "u-member-2"] as const;

describe("canViewScorecard", () => {
  it("dashboard owner sees everything (super-admin bypass)", () => {
    expect(
      canViewScorecard({ id: "u-jayden", role: "owner" }, SCORECARD, []),
    ).toBe(true);
    expect(
      canViewScorecard({ id: "u-jayden", role: "owner" }, SCORECARD, MEMBERS),
    ).toBe(true);
  });

  it("scorecard owner sees their own scorecard", () => {
    expect(
      canViewScorecard({ id: "u-owner", role: "admin" }, SCORECARD, []),
    ).toBe(true);
  });

  it("scorecard members see scorecards they were invited to", () => {
    expect(
      canViewScorecard(
        { id: "u-member-1", role: "staff" },
        SCORECARD,
        MEMBERS,
      ),
    ).toBe(true);
  });

  it("non-member non-owner non-dashboard-owner cannot see", () => {
    expect(
      canViewScorecard(
        { id: "u-stranger", role: "admin" },
        SCORECARD,
        MEMBERS,
      ),
    ).toBe(false);
  });

  it("accepts members as a Set or readonly array", () => {
    const setVariant = canViewScorecard(
      { id: "u-member-1", role: "staff" },
      SCORECARD,
      new Set(MEMBERS),
    );
    const arrayVariant = canViewScorecard(
      { id: "u-member-1", role: "staff" },
      SCORECARD,
      MEMBERS,
    );
    expect(setVariant).toBe(true);
    expect(arrayVariant).toBe(true);
  });
});

describe("canManageScorecard", () => {
  it("dashboard owner can manage anything", () => {
    expect(
      canManageScorecard({ id: "u-jayden", role: "owner" }, SCORECARD),
    ).toBe(true);
  });

  it("scorecard owner can manage their own", () => {
    expect(
      canManageScorecard({ id: "u-owner", role: "admin" }, SCORECARD),
    ).toBe(true);
  });

  it("members CANNOT manage even though they can view", () => {
    expect(
      canManageScorecard({ id: "u-member-1", role: "staff" }, SCORECARD),
    ).toBe(false);
  });

  it("strangers cannot manage", () => {
    expect(
      canManageScorecard({ id: "u-stranger", role: "admin" }, SCORECARD),
    ).toBe(false);
  });
});

describe("isScorecardParticipant", () => {
  it("returns true for the scorecard's owner", () => {
    expect(isScorecardParticipant("u-owner", SCORECARD, MEMBERS)).toBe(true);
  });

  it("returns true for members", () => {
    expect(isScorecardParticipant("u-member-1", SCORECARD, MEMBERS)).toBe(true);
  });

  it("returns false for non-participants", () => {
    expect(isScorecardParticipant("u-stranger", SCORECARD, MEMBERS)).toBe(false);
  });

  it("returns false when members list is empty and user is not the owner", () => {
    expect(isScorecardParticipant("u-stranger", SCORECARD, [])).toBe(false);
  });
});
