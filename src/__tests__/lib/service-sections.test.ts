import { describe, it, expect } from "vitest";
import { visibleServiceSections } from "@/lib/service-sections";

const keys = (o: Parameters<typeof visibleServiceSections>[0]) =>
  visibleServiceSections(o).map((g) => `${g.key}:${g.subTabs.map((s) => s.key).join(",")}`);

describe("visibleServiceSections", () => {
  it("lists every section in page order", () => {
    expect(visibleServiceSections({ isAdminPlus: true, canSeeCasualBookings: true, canSeeStaffFiles: true }).map((g) => g.key)).toEqual([
      "today", "overview", "staff", "family", "daily", "program", "eos", "compliance", "finance", "documents",
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
