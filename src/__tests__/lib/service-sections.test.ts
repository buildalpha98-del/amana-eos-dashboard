import { describe, it, expect } from "vitest";
import { visibleServiceSections, resolveSectionLink } from "@/lib/service-sections";

const keys = (o: Parameters<typeof visibleServiceSections>[0]) =>
  visibleServiceSections(o).map((g) => `${g.key}:${g.subTabs.map((s) => s.key).join(",")}`);

describe("visibleServiceSections", () => {
  it("lists every section in page order", () => {
    expect(visibleServiceSections({ isAdminPlus: true, canSeeCasualBookings: true, canSeeStaffFiles: true }).map((g) => g.key)).toEqual([
      "today", "overview", "staff", "daily", "children", "families", "program", "eos", "compliance", "finance", "documents",
    ]);
  });

  it("hides admin-only pages (Weekly Data, Billing) from non-admins", () => {
    const k = keys({ isAdminPlus: false, canSeeCasualBookings: true, canSeeStaffFiles: true }).join(" ");
    expect(k).not.toMatch(/weekly/);
    expect(k).not.toMatch(/billing/);
  });

  it("only adds Casual Bookings and Staff files when allowed", () => {
    const off = keys({ isAdminPlus: false, canSeeCasualBookings: false, canSeeStaffFiles: false }).join(" ");
    expect(off).not.toMatch(/casual-bookings/);
    expect(off).not.toMatch(/staff-files/);
    const on = keys({ isAdminPlus: false, canSeeCasualBookings: true, canSeeStaffFiles: true }).join(" ");
    expect(on).toMatch(/casual-bookings/);
    expect(on).toMatch(/staff-files/);
  });
});

describe("educator menu (2026-10-08)", () => {
  it("is the floor of the shift — only staff clocking, no Families, EOS, Finance or Settings", () => {
    expect(
      keys({ isEducator: true, isAdminPlus: false, canSeeCasualBookings: false, canSeeStaffFiles: false }),
    ).toEqual([
      "today:",
      "staff:sign-in-out",
      "daily:roll-call,medication,checklists,posts",
      "children:",
      "program:activities,menu,observations",
      "compliance:incidents,hazards,headcounts,registers,risk",
      "documents:policies,handbook",
    ]);
  });
});

describe("retired links still land (2026-10-09)", () => {
  it("moves existing staff attendance bookmarks to Staff", () => {
    expect(resolveSectionLink("daily", "roll-call", "staff")).toEqual({ tab: "staff", sub: "sign-in-out" });
  });
  it.each([
    [["daily", "sign-in-out"], { tab: "daily", sub: "roll-call" }],
    [["daily", "children"], { tab: "children", sub: null }],
    [["family", "children"], { tab: "children", sub: null }],
    [["family", "families"], { tab: "families", sub: null }],
    [["family", null], { tab: "families", sub: null }],
    [["overview", "fees"], { tab: "overview", sub: "fees" }],
  ] as const)("%j", ([tab, sub], expected) => {
    expect(resolveSectionLink(tab, sub)).toEqual(expected);
  });
});
