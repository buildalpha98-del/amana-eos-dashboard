import { describe, it, expect } from "vitest";
import {
  matchSchoolToService,
  matchScore,
  tokenise,
  MATCH_THRESHOLD,
} from "@/lib/school-service-match";

const SERVICES = [
  { id: "svc-mfis-green", name: "Amana OSHC Malek Fahd Greenacre" },
  { id: "svc-mfis-hox", name: "Amana OSHC Malek Fahd Hoxton Park" },
  { id: "svc-min-spring", name: "Amana OSHC Minaret Springvale" },
  { id: "svc-min-officer", name: "Amana OSHC Minaret Officer" },
  { id: "svc-unity", name: "Amana OSHC Unity Grammar" },
  { id: "svc-aia", name: "Amana OSHC AIA Coburg" },
];

describe("tokenise", () => {
  it("drops words every service shares", () => {
    // "amana"/"oshc"/"college" carry no signal — if they counted, every
    // school would match every service.
    expect(tokenise("Amana OSHC Minaret College Springvale")).toEqual([
      "minaret",
      "springvale",
    ]);
  });

  it("splits on punctuation and keeps meaningful short words", () => {
    // "Al" is two letters and part of the name — dropping it would make
    // "Al-Taqwa" and "Taqwa" indistinguishable. Only 1-char noise goes.
    expect(tokenise("Al-Taqwa College")).toEqual(["al", "taqwa"]);
    expect(tokenise("A B Unity")).toEqual(["unity"]);
  });
});

describe("matchScore", () => {
  it("is 1 when every meaningful school word appears in the service", () => {
    expect(
      matchScore("Minaret College Springvale", "Amana OSHC Minaret Springvale"),
    ).toBe(1);
  });

  it("doesn't penalise a service for carrying extra words", () => {
    expect(
      matchScore(
        "Unity Grammar",
        "Amana OSHC Unity Grammar Before and After School Care",
      ),
    ).toBe(1);
  });

  it("is 0 for unrelated names", () => {
    expect(matchScore("Unity Grammar", "Amana OSHC AIA Coburg")).toBe(0);
  });
});

describe("matchSchoolToService", () => {
  it("matches a campus to its own service", () => {
    const r = matchSchoolToService("Minaret College Springvale", SERVICES);
    expect(r.serviceId).toBe("svc-min-spring");
    expect(r.ambiguous).toBe(false);
  });

  it("distinguishes two campuses of the same school", () => {
    // The failure that matters most: putting a child on the wrong
    // centre's roll and invoice.
    expect(matchSchoolToService("Malek Fahd Greenacre", SERVICES).serviceId).toBe(
      "svc-mfis-green",
    );
    expect(
      matchSchoolToService("Malek Fahd Hoxton Park", SERVICES).serviceId,
    ).toBe("svc-mfis-hox");
  });

  it("matches a single-campus school", () => {
    expect(matchSchoolToService("Unity Grammar", SERVICES).serviceId).toBe(
      "svc-unity",
    );
  });

  it("REFUSES to guess when a school name is ambiguous", () => {
    // "Minaret" alone fits Springvale and Officer equally. Picking one
    // would silently put the child at a centre they don't attend.
    const r = matchSchoolToService("Minaret", SERVICES);
    expect(r.serviceId).toBeNull();
    expect(r.ambiguous).toBe(true);
  });

  it("returns null for a school we don't service", () => {
    const r = matchSchoolToService("Some Other Public School", SERVICES);
    expect(r.serviceId).toBeNull();
    expect(r.score).toBeLessThan(MATCH_THRESHOLD);
  });

  it("handles empty and missing input without throwing", () => {
    expect(matchSchoolToService(null, SERVICES).serviceId).toBeNull();
    expect(matchSchoolToService("", SERVICES).serviceId).toBeNull();
    expect(matchSchoolToService("Unity Grammar", []).serviceId).toBeNull();
  });

  it("is case and punctuation insensitive", () => {
    expect(
      matchSchoolToService("  minaret college, SPRINGVALE ", SERVICES).serviceId,
    ).toBe("svc-min-spring");
  });
});
