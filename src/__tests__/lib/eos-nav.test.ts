import { describe, it, expect } from "vitest";
import { navItems, filterNavItems } from "@/lib/nav-config";

// 2026-06-23: EOS roles must SEE the EOS sidebar links. The EOS nav items
// gate on EOS_SIDEBAR_ROLES (was head_office/admin/marketing only), so
// without adding the EOS roles, an eos_viewer/eos_implementer saw page
// access but no sidebar entry to reach it.

function hrefs(role: "eos_implementer" | "eos_viewer") {
  return new Set(filterNavItems(navItems, role).map((i) => i.href));
}

describe("EOS roles see the EOS sidebar surface", () => {
  it("eos_implementer sees every EOS nav link", () => {
    const h = hrefs("eos_implementer");
    for (const href of [
      "/vision",
      "/rocks",
      "/scorecard",
      "/todos",
      "/issues",
      "/meetings",
      "/accountability-chart",
    ]) {
      expect(h.has(href)).toBe(true);
    }
  });

  it("eos_viewer sees the EOS nav links too", () => {
    const h = hrefs("eos_viewer");
    for (const href of ["/vision", "/rocks", "/scorecard", "/todos", "/issues", "/meetings"]) {
      expect(h.has(href)).toBe(true);
    }
  });

  it("eos_implementer does NOT see non-EOS sections", () => {
    const h = hrefs("eos_implementer");
    for (const href of ["/services", "/financials", "/marketing", "/team", "/settings", "/incidents"]) {
      expect(h.has(href)).toBe(false);
    }
  });
});
