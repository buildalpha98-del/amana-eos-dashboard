import { describe, it, expect } from "vitest";
import { checklistStatus } from "@/lib/checklist-due";
import { resolveAppSettings, appSettingsSchema } from "@/lib/app-settings";

const item = (category: string, checked: boolean, isRequired = true) => ({ category, checked, isRequired });

describe("checklistStatus", () => {
  const due = { bsc: { opening: "07:00" }, asc: { closing: "18:15" } };

  it("flags a section overdue only past its time with required items left", () => {
    const lists = [{ sessionType: "bsc", items: [item("opening", true), item("opening", false)] }];
    expect(checklistStatus(lists, due, "06:55", new Set(["bsc"]))[0].overdue).toBe(false);
    expect(checklistStatus(lists, due, "07:00", new Set(["bsc"]))[0].overdue).toBe(true);
  });

  it("isn't overdue when only optional items are left", () => {
    const lists = [{ sessionType: "bsc", items: [item("opening", true), item("opening", false, false)] }];
    expect(checklistStatus(lists, due, "08:00", new Set(["bsc"]))[0].overdue).toBe(false);
  });

  it("reports a missing checklist for a session that's running, not one that isn't", () => {
    const running = checklistStatus([], due, "19:00", new Set(["asc"]));
    expect(running).toEqual([
      expect.objectContaining({ sessionType: "asc", category: "closing", missing: true, overdue: true }),
    ]);
  });

  it("counts done / total per section", () => {
    const lists = [{ sessionType: "asc", items: [item("closing", true), item("closing", true), item("safety", false)] }];
    const s = checklistStatus(lists, {}, "12:00", new Set(["asc"]));
    expect(s.find((x) => x.category === "closing")).toMatchObject({ done: 2, total: 2, due: null, overdue: false });
  });
});

describe("checklist due-time settings", () => {
  it("default to no reminders", () => {
    expect(resolveAppSettings(null).checklists.dueTimes).toEqual({});
  });
  it("accept a partial set and reject a bad time", () => {
    expect(appSettingsSchema.safeParse({ checklists: { dueTimes: { bsc: { opening: "07:00" } } } }).success).toBe(true);
    expect(appSettingsSchema.safeParse({ checklists: { dueTimes: { bsc: { opening: "7am" } } } }).success).toBe(false);
  });
});
