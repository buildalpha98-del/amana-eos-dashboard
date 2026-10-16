import { describe, it, expect } from "vitest";
import { scoreCandidate, vacancyIsHoliday, fitForRecords, type FitCandidate } from "@/lib/recruitment/fit";
import { HOLIDAY_QUEST_ADS } from "@/lib/recruitment/holiday-quest-ads";
import { publicVacancyWhere } from "@/lib/recruitment/public-vacancy";

const base: FitCandidate = {
  state: "VIC",
  qualification: null,
  studying: false,
  vicDiplomaLevel: null,
  wwccNumber: null,
  hasFirstAid: false,
  rightToWork: "citizen",
  yearsExperience: null,
  previousRole: null,
  holidayWeeks: null,
  availableSessions: [],
  availableDays: [],
  hasTransport: false,
};
const vicHoliday = { state: "VIC", qualificationRequired: "diploma", holiday: true };
const nswHoliday = { state: "NSW", qualificationRequired: "none", holiday: true };

describe("scoreCandidate", () => {
  it("rates a well-qualified, available VIC applicant a strong match", () => {
    const r = scoreCandidate(vicHoliday, {
      ...base,
      vicDiplomaLevel: true,
      holidayWeeks: 5,
      wwccNumber: "1234567A",
      yearsExperience: 3,
      hasFirstAid: true,
      hasTransport: true,
    });
    expect(r.label).toBe("strong");
    expect(r.score).toBe(100);
  });

  it("marks a VIC diploma ad not eligible without a diploma-level qualification", () => {
    const r = scoreCandidate(vicHoliday, { ...base, qualification: "cert_iii", holidayWeeks: 5, wwccNumber: "x" });
    expect(r.label).toBe("not_eligible");
    expect(r.score).toBeLessThanOrEqual(30);
    expect(r.reasons[0]).toMatch(/diploma-level/);
  });

  it("gives partial credit for an unlisted diploma on a VIC ad", () => {
    const r = scoreCandidate(vicHoliday, { ...base, qualification: "diploma" });
    expect(r.label).not.toBe("not_eligible");
    expect(r.reasons.join(" ")).toMatch(/check it's on Victoria's/);
  });

  it("never passes someone without work rights", () => {
    const r = scoreCandidate(nswHoliday, { ...base, state: "NSW", rightToWork: "no_rights", vicDiplomaLevel: true, holidayWeeks: 6 });
    expect(r.label).toBe("not_eligible");
    expect(r.reasons[0]).toMatch(/right to work/);
  });

  it("accepts NSW applicants with no qualification", () => {
    const r = scoreCandidate(nswHoliday, { ...base, state: "NSW", holidayWeeks: 4, wwccNumber: "WWC1", yearsExperience: 2 });
    expect(r.label).toBe("good");
    expect(r.reasons).toContain("No qualification (fine for this role)");
  });

  it("flags a state mismatch", () => {
    const r = scoreCandidate(nswHoliday, { ...base, state: "VIC" });
    expect(r.reasons.join(" ")).toMatch(/Wants to work in VIC/);
  });

  it("uses weekdays for term-time ads", () => {
    const r = scoreCandidate({ ...nswHoliday, holiday: false }, { ...base, state: "NSW", availableDays: ["mon", "tue", "wed", "thu"] });
    expect(r.reasons).toContain("Available 4 days a week");
  });
});

describe("vacancyIsHoliday / fitForRecords", () => {
  it("recognises holiday ads by title or period", () => {
    expect(vacancyIsHoliday({ title: "Holiday Quest Educator — Hills District" })).toBe(true);
    expect(vacancyIsHoliday({ title: "Educator", workPeriod: "School holidays" })).toBe(true);
    expect(vacancyIsHoliday({ title: "Educator" })).toBe(false);
  });

  it("falls back to the centre's state", () => {
    const r = fitForRecords(
      { state: null, qualificationRequired: "diploma", title: "Holiday Quest", workPeriod: null, service: { state: "VIC" } },
      { ...base, qualification: null },
    );
    expect(r.label).toBe("not_eligible");
  });
});

describe("Holiday Quest ads", () => {
  it("has the five regional ads with state pay ranges", () => {
    expect(HOLIDAY_QUEST_ADS).toHaveLength(5);
    for (const ad of HOLIDAY_QUEST_ADS) {
      expect(ad.payRate).toBe(ad.state === "VIC" ? "$40–$46 an hour + super (casual)" : "$35–$45 an hour + super (casual)");
      expect(ad.qualificationRequired).toBe(ad.state === "VIC" ? "diploma" : "none");
      expect(ad.notes).toContain(ad.payRate);
    }
    expect(new Set(HOLIDAY_QUEST_ADS.map((a) => a.title)).size).toBe(5);
  });
});

describe("publicVacancyWhere", () => {
  it("keeps an ad open through its closing day (Sydney)", () => {
    // 10pm 20 Nov Sydney = 11:00 UTC 20 Nov
    const w = publicVacancyWhere(new Date("2026-11-20T11:00:00Z"));
    expect(w.status).toBe("open");
    expect(w.postedChannels).toEqual({ has: "website" });
    const gte = (w.OR as Array<{ closesAt: { gte?: Date } | null }>)[1].closesAt as { gte: Date };
    expect(gte.gte.toISOString().slice(0, 10)).toBe("2026-11-20");
  });
});
