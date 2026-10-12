/**
 * Finding each centre's SharePoint folder for its monthly Program Plan.
 * Folder names are the real ones in the NSW Schools / Melbourne Schools
 * libraries (2026-10-12); centre names are the seeded ones.
 */
import { describe, it, expect } from "vitest";
import { centreKeys, matchCentreFolder, newestTermFolder, shareId, NIGHTLY_PILOT } from "@/lib/program-plan/sync";
import { menuPlanSchema, programPlanSchema } from "@/lib/program-plan/extract";
import { capMinutes, libraryCandidates, libraryKey } from "@/lib/program-plan/library";

const NSW = "https://amanaoshcptyltd.sharepoint.com/NSW%20Schools";
const VIC = "https://amanaoshcptyltd.sharepoint.com/Melbourne%20Schools";
const folders = [
  ...[
    "Amana OSHC - MFIS Greenacre",
    "Amana OSHC - MFIS BH",
    "Amana OSHC - MFIS HP",
    "Amana OSHC - Unity Grammar",
    "Amana OSHC - Arkana College",
    "Amana OSHC - Minarah College",
    "NSW Service Board Pack",
  ].map((name) => ({ driveId: "nsw", name, driveWebUrl: NSW })),
  ...[
    "Amana OSHC - AIA KKCC",
    "Amana OSHC - Al-Taqwa College",
    "Amana OSHC - Minaret Officer",
    "Amana OSHC - Minaret Doveton",
    "Amana OSHC - Minaret Springvale",
    "VIC Service Board Pack",
  ].map((name) => ({ driveId: "vic", name, driveWebUrl: VIC })),
];
const find = (name: string, sharepointUrl = "") => matchCentreFolder({ name, sharepointUrl }, folders);

describe("matching a centre to its SharePoint folder", () => {
  it.each([
    ["Amana OSHC MFIS Greenacre", "Amana OSHC - MFIS Greenacre"],
    ["Amana OSHC MFIS Beaumont Hills", "Amana OSHC - MFIS BH"],
    ["Amana OSHC MFIS Hoxton Park", "Amana OSHC - MFIS HP"],
    ["Amana OSHC Unity Grammar", "Amana OSHC - Unity Grammar"],
    ["Amana OSHC Arkana College", "Amana OSHC - Arkana College"],
    ["Amana OSHC Minarah College", "Amana OSHC - Minarah College"],
    ["Amana OSHC Al-Taqwa College", "Amana OSHC - Al-Taqwa College"],
    ["Amana OSHC Minaret Doveton", "Amana OSHC - Minaret Doveton"],
    ["Amana OSHC Minaret Officer", "Amana OSHC - Minaret Officer"],
    ["Amana OSHC Minaret Springvale", "Amana OSHC - Minaret Springvale"],
    ["Amana OSHC AIA KKCC", "Amana OSHC - AIA KKCC"],
    // The dashboard calls it Coburg; the SharePoint folder is AIA KKCC.
    ["Amana OSHC AIA Coburg", "Amana OSHC - AIA KKCC"],
  ])("%s → %s", (centre, folder) => {
    expect(find(centre)).toMatchObject({ name: folder });
  });

  it("says what to do when the name doesn't match, instead of guessing", () => {
    const r = find("Amana OSHC Somewhere New");
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toMatch(/Paste the centre's program folder link/);
  });

  it("uses the centre's saved SharePoint link first", () => {
    const url = `${NSW}/Amana%20OSHC%20-%20MFIS%20BH/QA1%20-%20Educational%20Program%20%26%20Practice`;
    expect(find("Something else entirely", url)).toMatchObject({ name: "Amana OSHC - MFIS BH", driveId: "nsw" });
  });

  it("never matches a centre to a state board pack", () => {
    expect(centreKeys("NSW Service Board Pack")).not.toContain("");
    expect(find("Amana OSHC Irfan College")).toHaveProperty("error");
  });
});

describe("what Claude may hand back", () => {
  const week = {
    weekStart: "2026-10-12",
    title: "Welcome Back",
    closedDays: ["monday"],
    activities: [{ day: "tuesday", startTime: "15:45", endTime: "16:15", title: "Homework Heroes" }],
    meals: [{ day: "tuesday", slot: "breakfast", description: "Weet-Bix with milk" }],
  };
  it("accepts a well-formed week", () => {
    expect(programPlanSchema.safeParse({ weeks: [week] }).success).toBe(true);
  });
  it("rejects 12-hour times and unknown meal slots", () => {
    expect(
      programPlanSchema.safeParse({ weeks: [{ ...week, activities: [{ ...week.activities[0], startTime: "3:45pm" }] }] }).success,
    ).toBe(false);
    expect(
      programPlanSchema.safeParse({ weeks: [{ ...week, meals: [{ ...week.meals[0], slot: "dinner" }] }] }).success,
    ).toBe(false);
  });
});

describe("a pasted folder link", () => {
  it("encodes the way Microsoft Graph's /shares endpoint expects", () => {
    // The worked example in Microsoft's "Accessing shared items" docs.
    expect(shareId("https://onedrive.live.com/redir?resid=1231244193912!12&authKey=1201919!12921!1")).toBe(
      "u!aHR0cHM6Ly9vbmVkcml2ZS5saXZlLmNvbS9yZWRpcj9yZXNpZD0xMjMxMjQ0MTkzOTEyITEyJmF1dGhLZXk9MTIwMTkxOSExMjkyMSEx",
    );
  });
});

describe("the term folder", () => {
  it("picks the newest 'Term N YYYY Program' folder and ignores the rest", () => {
    const items = [
      { name: "QA1 - Educational Program & Practice" },
      { name: "Term 3 2026 Program" },
      { name: "Term 4 2026 Program" },
      { name: "Term 1 2026 Program" },
    ];
    expect(newestTermFolder(items)?.name).toBe("Term 4 2026 Program");
    expect(newestTermFolder([...items, { name: "Term 1 2027 Program" }])?.name).toBe("Term 1 2027 Program");
    expect(newestTermFolder([{ name: "Programs" }])).toBeNull();
  });

  it("syncs every centre nightly (the AIA pilot is over)", () => {
    expect(NIGHTLY_PILOT).toBeNull();
  });
});

describe("the menu file", () => {
  it("keeps allergens to the editor's words", () => {
    const week = {
      weekStart: "2026-10-12",
      meals: [{ day: "monday", slot: "breakfast", description: "Porridge with milk", allergens: ["dairy", "gluten"] }],
    };
    expect(menuPlanSchema.safeParse({ weeks: [week] }).success).toBe(true);
    expect(
      menuPlanSchema.safeParse({ weeks: [{ ...week, meals: [{ ...week.meals[0], allergens: ["M"] }] }] }).success,
    ).toBe(false);
  });
});

describe("program-plan activities for the Activity Library", () => {
  it("keeps real activities once each, merging their MTOP outcomes", () => {
    const c = libraryCandidates([
      { title: "Imagination Station: Grow a Chickpea in a Jar", description: "Plant and predict", mtopOutcomes: [4] },
      { title: "Imagination Station: Grow a Chickpea in a Jar!", mtopOutcomes: [2] },
      { title: "Homework Heroes", programmeBrand: "homework_heroes" },
      { title: "Free play and pack-up", programmeBrand: "free_play" },
      { title: "Afternoon tea" },
      { title: "Little Champions Club: Champions Circuit", mtopOutcomes: [3] },
    ]);
    expect(c.map((x) => x.title)).toEqual([
      "Imagination Station: Grow a Chickpea in a Jar!",
      "Little Champions Club: Champions Circuit",
    ]);
    expect(c[0].mtopOutcomes).toEqual([2, 4]);
    expect(c[0].description).toBe("Plant and predict");
  });

  it("treats punctuation and case as the same activity", () => {
    expect(libraryKey("Fuel Up — Friendship Fruit Kebabs!")).toBe(libraryKey("fuel up friendship fruit kebabs"));
  });
});

describe("library activity length", () => {
  it("is an hour at most", () => {
    expect(capMinutes(75)).toBe(60);
    expect(capMinutes(45)).toBe(45);
    expect(capMinutes(0)).toBeNull();
    expect(capMinutes(null)).toBeNull();
  });
});
