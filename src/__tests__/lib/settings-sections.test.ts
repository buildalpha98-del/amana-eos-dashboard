import { describe, it, expect } from "vitest";
import {
  SETTINGS_GROUPS,
  visibleGroups,
  visibleItems,
  searchSettings,
  resolveGroup,
} from "@/lib/settings-sections";

describe("SETTINGS_GROUPS", () => {
  it("has a unique key per group", () => {
    const keys = SETTINGS_GROUPS.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has a globally unique key per item", () => {
    // Item keys drive the render switch, so a duplicate would silently
    // render the wrong card.
    const keys = SETTINGS_GROUPS.flatMap((g) => g.items.map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every item at least one role", () => {
    for (const g of SETTINGS_GROUPS) {
      for (const i of g.items) {
        expect(i.roles.length, `${g.key}/${i.key}`).toBeGreaterThan(0);
      }
    }
  });

  it("gives every item a description", () => {
    for (const g of SETTINGS_GROUPS) {
      for (const i of g.items) {
        expect(i.description.trim(), `${g.key}/${i.key}`).not.toBe("");
      }
    }
  });

  it("points every href at a /settings path", () => {
    for (const g of SETTINGS_GROUPS) {
      for (const i of g.items) {
        if (i.href) expect(i.href.startsWith("/settings/")).toBe(true);
      }
    }
  });
});

describe("visibleItems / visibleGroups", () => {
  it("shows the owner everything", () => {
    const total = SETTINGS_GROUPS.flatMap((g) => g.items).length;
    const seen = visibleGroups("owner").flatMap((g) =>
      visibleItems(g, "owner"),
    ).length;
    expect(seen).toBe(total);
  });

  it("hides owner-only items from head office", () => {
    const ho = visibleGroups("head_office").flatMap((g) =>
      visibleItems(g, "head_office").map((i) => i.key),
    );
    expect(ho).not.toContain("api-keys");
    expect(ho).not.toContain("budget-tiers");
    expect(ho).not.toContain("xero");
    // …but head office keeps the things it does own.
    expect(ho).toContain("users");
    expect(ho).toContain("payroll");
  });

  it("gives a coordinator only the notification log", () => {
    const groups = visibleGroups("member");
    const items = groups.flatMap((g) => visibleItems(g, "member").map((i) => i.key));
    expect(items).toEqual(["notification-log"]);
    // …and therefore only the one group it lives in.
    expect(groups.map((g) => g.key)).toEqual(["communications"]);
  });

  it("returns nothing for a null role", () => {
    expect(visibleGroups(null)).toEqual([]);
    expect(visibleGroups(undefined)).toEqual([]);
  });

  it("never returns a group with no visible items", () => {
    for (const role of ["owner", "head_office", "admin", "member"] as const) {
      for (const g of visibleGroups(role)) {
        expect(visibleItems(g, role).length, `${role}/${g.key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("searchSettings", () => {
  it("returns nothing for an empty query", () => {
    expect(searchSettings("", "owner")).toEqual([]);
    expect(searchSettings("   ", "owner")).toEqual([]);
  });

  it("matches on the label", () => {
    const hits = searchSettings("kiosk", "owner");
    expect(hits.map((h) => h.item.key)).toContain("kiosks");
  });

  it("matches on a keyword the label doesn't contain", () => {
    // Someone looking for the payroll integration types the vendor.
    const hits = searchSettings("employment hero", "owner");
    expect(hits.map((h) => h.item.key)).toContain("payroll");
  });

  it("matches on the description", () => {
    const hits = searchSettings("brand colours", "owner");
    expect(hits.map((h) => h.item.key)).toContain("org");
  });

  it("is case-insensitive", () => {
    expect(searchSettings("XERO", "owner").map((h) => h.item.key)).toContain(
      "xero",
    );
  });

  it("never surfaces an item the role cannot see", () => {
    // "token" is an api-keys keyword; head office must not get it.
    const hits = searchSettings("token", "head_office");
    expect(hits.map((h) => h.item.key)).not.toContain("api-keys");
  });

  it("pairs each hit with the group it lives in", () => {
    const hit = searchSettings("kiosk", "owner")[0];
    expect(hit.group.key).toBe("people");
  });
});

describe("resolveGroup", () => {
  it("returns the requested group when the role can see it", () => {
    expect(resolveGroup("integrations", "owner")?.key).toBe("integrations");
  });

  it("falls back to the first visible group for an unknown key", () => {
    expect(resolveGroup("nonsense", "owner")?.key).toBe("organisation");
  });

  it("falls back rather than returning a group the role cannot see", () => {
    // A coordinator with a bookmarked ?section=integrations gets the one
    // group they can actually use, not an empty page.
    expect(resolveGroup("integrations", "member")?.key).toBe("communications");
  });

  it("returns null when the role can see nothing", () => {
    expect(resolveGroup("organisation", null)).toBeNull();
  });

  it("tolerates a null request", () => {
    expect(resolveGroup(null, "owner")?.key).toBe("organisation");
  });
});
