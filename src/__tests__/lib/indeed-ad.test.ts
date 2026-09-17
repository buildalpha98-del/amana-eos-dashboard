/**
 * Tests for the Indeed posting kit.
 *
 * What MUST be true:
 *   - The apply URL carries `?src=indeed` and is shaped exactly like the URL
 *     the public page parses — if these two drift, every Indeed applicant
 *     silently reverts to "website" and the ad looks like it produced nobody.
 *   - A regional ad (no centre) still gets a location, because that is the
 *     normal shape for casual-pool advertising.
 *   - Unfilled [BRACKETED] blanks from the job-ad template are caught before
 *     the ad goes live.
 *   - Anything that would make the apply link 404 is reported as a blocker.
 */
import { describe, it, expect } from "vitest";
import {
  buildIndeedAd,
  findPlaceholders,
  formatIndeedAd,
  trackedApplyUrl,
  trackedRegisterUrl,
  type IndeedAdVacancy,
} from "@/lib/recruitment/indeed-ad";
import { normalisePublicSource } from "@/lib/recruitment/pool";

const ORIGIN = "https://amanaoshc.company";

const liveVacancy: IndeedAdVacancy = {
  id: "vac-1",
  role: "educator",
  employmentType: "casual",
  status: "open",
  postedChannels: ["website"],
  notes: "Come and work with us. Pay: $38 per hour plus super.",
  service: { name: "Amana OSHC MFIS Greenacre", suburb: "Greenacre", state: "NSW" },
};

describe("trackedApplyUrl", () => {
  it("points at the public apply page with the source attached", () => {
    expect(trackedApplyUrl(ORIGIN, "vac-1")).toBe(
      "https://amanaoshc.company/careers/vac-1?src=indeed",
    );
  });

  it("takes any pool source, not just Indeed", () => {
    expect(trackedApplyUrl(ORIGIN, "vac-1", "seek")).toContain("?src=seek");
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(trackedApplyUrl("https://amanaoshc.company/", "vac-1")).toBe(
      "https://amanaoshc.company/careers/vac-1?src=indeed",
    );
  });

  it("produces a src the public intake actually recognises", () => {
    // The whole integration hangs on this: the dashboard hands out the link,
    // the public page parses it back. A mismatch loses the attribution
    // silently, which is the worst way to lose it.
    const url = new URL(trackedApplyUrl(ORIGIN, "vac-1"));
    expect(normalisePublicSource(url.searchParams.get("src"))).toBe("indeed");
  });
});

describe("trackedRegisterUrl", () => {
  it("points at the general pool front door", () => {
    expect(trackedRegisterUrl(ORIGIN)).toBe(
      "https://amanaoshc.company/careers/register?src=indeed",
    );
  });
});

describe("findPlaceholders", () => {
  it("finds the template's bracketed blanks", () => {
    const found = findPlaceholders(
      "• Pay: [PAY RATE — e.g. $30–$35 per hour, before super]\n• Start: [START DATE]",
    );
    expect(found).toEqual([
      "[PAY RATE — e.g. $30–$35 per hour, before super]",
      "[START DATE]",
    ]);
  });

  it("de-duplicates repeats and handles empty copy", () => {
    expect(findPlaceholders("[START DATE] then [START DATE]")).toEqual([
      "[START DATE]",
    ]);
    expect(findPlaceholders(null)).toEqual([]);
  });
});

describe("buildIndeedAd", () => {
  it("maps a live centre-based vacancy with no blockers", () => {
    const ad = buildIndeedAd(liveVacancy, ORIGIN);
    expect(ad).toMatchObject({
      title: "Before & After School Care Educator (OSHC)",
      company: "Amana OSHC",
      location: "Greenacre, NSW",
      jobType: "Casual",
      applyUrl: "https://amanaoshc.company/careers/vac-1?src=indeed",
    });
    expect(ad.blockers).toEqual([]);
    expect(ad.placeholders).toEqual([]);
  });

  it("uses the catchment as the location for a regional pool ad", () => {
    const ad = buildIndeedAd(
      { ...liveVacancy, service: null, region: "Eastern Melbourne" },
      ORIGIN,
    );
    expect(ad.location).toBe("Eastern Melbourne");
    expect(ad.blockers).toEqual([]);
  });

  it("falls back to the centre name when no suburb is recorded", () => {
    const ad = buildIndeedAd(
      { ...liveVacancy, service: { name: "Amana OSHC Unity Grammar" } },
      ORIGIN,
    );
    expect(ad.location).toBe("Amana OSHC Unity Grammar");
  });

  it("flags an ad that is not published to the careers page", () => {
    // This is the one that actually bites: the ad goes up on Indeed, the
    // apply link 404s, and nobody finds out until the applications don't come.
    const ad = buildIndeedAd({ ...liveVacancy, postedChannels: [] }, ORIGIN);
    expect(ad.blockers.join(" ")).toContain("404");
  });

  it("flags a vacancy that is no longer open", () => {
    const ad = buildIndeedAd({ ...liveVacancy, status: "filled" }, ORIGIN);
    expect(ad.blockers.some((b) => b.includes("filled"))).toBe(true);
  });

  it("flags missing ad copy and a missing location", () => {
    const ad = buildIndeedAd(
      { ...liveVacancy, notes: "   ", service: null, region: null },
      ORIGIN,
    );
    expect(ad.blockers).toHaveLength(2);
    expect(ad.description).toBe("");
  });

  it("surfaces unfilled template blanks from the ad copy", () => {
    const ad = buildIndeedAd(
      { ...liveVacancy, notes: "The details\n• Pay: [PAY RATE]" },
      ORIGIN,
    );
    expect(ad.placeholders).toEqual(["[PAY RATE]"]);
    // A blank is a warning, not a blocker — the link still works.
    expect(ad.blockers).toEqual([]);
  });

  it("labels an unknown role rather than dropping the title", () => {
    const ad = buildIndeedAd({ ...liveVacancy, role: "bus_driver" }, ORIGIN);
    expect(ad.title).toBe("bus driver — Out of School Hours Care");
  });
});

describe("formatIndeedAd", () => {
  it("includes every field Indeed's posting form asks for", () => {
    const text = formatIndeedAd(buildIndeedAd(liveVacancy, ORIGIN));
    expect(text).toContain("Job title: Before & After School Care Educator");
    expect(text).toContain("Company: Amana OSHC");
    expect(text).toContain("Location: Greenacre, NSW");
    expect(text).toContain("Job type: Casual");
    expect(text).toContain("?src=indeed");
    expect(text).toContain("Come and work with us.");
  });
});
