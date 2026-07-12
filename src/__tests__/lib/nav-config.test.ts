import { describe, it, expect } from "vitest";
import { filterNavItems, navItems, partitionNavSection, type NavItem } from "@/lib/nav-config";
import type { Role } from "@prisma/client";

describe("filterNavItems", () => {
  it("includes /contracts for owner (has contracts.view)", () => {
    const filtered = filterNavItems(navItems, "owner" as Role);
    expect(filtered.some((i) => i.href === "/contracts")).toBe(true);
  });

  it("includes /contracts for staff (has contracts.view)", () => {
    const filtered = filterNavItems(navItems, "staff" as Role);
    expect(filtered.some((i) => i.href === "/contracts")).toBe(true);
  });

  it("excludes /contracts for marketing (no contracts.view)", () => {
    const filtered = filterNavItems(navItems, "marketing" as Role);
    expect(filtered.some((i) => i.href === "/contracts")).toBe(false);
  });

  it("returns items without a feature gate when the role has page access", () => {
    // Sanity: items without `feature` are filtered only by canAccessPage.
    // /dashboard has no feature gate — owner should see it.
    const ownerFiltered = filterNavItems(navItems, "owner" as Role);
    expect(ownerFiltered.some((i) => i.href === "/dashboard")).toBe(true);
  });

  it("excludes items when role lacks page access (no feature required)", () => {
    // /permissions or /api-keys style routes — marketing should not see admin-only pages.
    // We assert via /audit-log which is admin-oriented and not in marketing's rolePageAccess.
    const marketingFiltered = filterNavItems(navItems, "marketing" as Role);
    expect(marketingFiltered.some((i) => i.href === "/audit-log")).toBe(false);
  });

  // 2026-04-30: coordinator collapsed into member; the prior
  // "includes /contracts for coordinator" assertion is obsolete because
  // member's allowlist (the post-2026-04-29 service-level scope) excludes
  // cross-service HR surfaces like /contracts.
  it("excludes /contracts for member (cross-service HR surface)", () => {
    const filtered = filterNavItems(navItems, "member" as Role);
    expect(filtered.some((i) => i.href === "/contracts")).toBe(false);
  });

  it("returns a new array (does not mutate input)", () => {
    const before = navItems.length;
    filterNavItems(navItems, "staff" as Role);
    expect(navItems.length).toBe(before);
  });

  it("handles undefined role by returning items without feature gates", () => {
    // During session hydration, role is undefined. canAccessPage returns true
    // for undefined but hasFeature returns false, so feature-gated items are hidden.
    const filtered = filterNavItems(navItems, undefined);
    // /contracts is feature-gated → hidden
    expect(filtered.some((i) => i.href === "/contracts")).toBe(false);
    // /dashboard has no feature gate → shown
    expect(filtered.some((i) => i.href === "/dashboard")).toBe(true);
  });
});

// ─── Sprint 1: role allowlist on nav items ─────────────────
describe("filterNavItems — role allowlist (Sprint 1)", () => {
  describe("marketing role", () => {
    const marketingFiltered = filterNavItems(navItems, "marketing" as Role);
    const hrefs = marketingFiltered.map((i) => i.href);

    it.each([
      "/crm",
      "/contact-centre",
      "/enrolments",
      "/children",
      "/conversions",
      "/messaging",
    ])("excludes out-of-scope nav item %s", (href) => {
      expect(hrefs).not.toContain(href);
    });

    it.each([
      "/marketing",
      "/communication",
      "/projects",
      "/scorecard",
      "/holiday-quest",
      // 2026-06-03: EOS opened up for marketing pod L10
      "/vision",
      "/rocks",
      "/todos",
      "/issues",
      "/meetings",
    ])("includes Akram's cockpit nav item %s", (href) => {
      expect(hrefs).toContain(href);
    });

    it("hides every item tagged with ALL_NON_MARKETING roles", () => {
      // Spot-check a handful of ALL_NON_MARKETING items across sections.
      // 2026-06-03: /vision and /rocks moved out — marketing now runs EOS.
      for (const href of ["/services", "/financials", "/team", "/leadership", "/automations"]) {
        expect(hrefs).not.toContain(href);
      }
    });
  });

  describe("owner role — bypass", () => {
    it("sees every item that survives canAccessPage + feature checks, including role-gated ones", () => {
      const ownerFiltered = filterNavItems(navItems, "owner" as Role);
      const hrefs = ownerFiltered.map((i) => i.href);
      // Owner bypasses roles — they see items tagged with ALL_NON_MARKETING too.
      for (const href of ["/vision", "/rocks", "/crm", "/contact-centre", "/leadership", "/automations"]) {
        expect(hrefs).toContain(href);
      }
    });

    it("result length is at least as large as the coordinator/marketing filtered result", () => {
      const owner = filterNavItems(navItems, "owner" as Role).length;
      const marketing = filterNavItems(navItems, "marketing" as Role).length;
      const coordinator = filterNavItems(navItems, "member" as Role).length;
      expect(owner).toBeGreaterThan(marketing);
      expect(owner).toBeGreaterThanOrEqual(coordinator);
    });
  });

  // 2026-04-30: the former "coordinator role unaffected by sprint 1" block
  // was obsolete — coordinator role is gone, and the merged member role
  // tracks the post-2026-04-29 cleaned-up service-level allowlist.
  // Coverage of merged-member nav lives in the "member role — single-centre
  // cleanup" describe block below.

  // ─── 2026-04-29: member nav cleanup ────────────────────────
  // Centre Directors (member role) had access to a long list of cross-
  // service tabs that didn't match their actual workflow. After training
  // session feedback we trimmed their rolePageAccess to focus on their
  // single centre + EOS participation.
  describe("member role — single-centre cleanup", () => {
    const memberFiltered = filterNavItems(navItems, "member" as Role);
    const hrefs = memberFiltered.map((i) => i.href);

    it.each([
      "/messaging",         // CRM-tier cross-service direct messages
      "/contact-centre",    // CRM cross-service inbox
      "/communication",     // Cross-service comms hub
      "/enquiries",         // CRM
      "/conversions",       // Analytics
      "/enrolments",        // Cross-service list (use service detail instead)
      "/children",          // Cross-service list (use service detail instead)
      "/roll-call",         // 404 — lives inside service detail
      "/bookings",          // Cross-service (use service detail)
      "/billing",           // Cross-service (use service Finance tab)
      "/reports",           // Cross-service analytics
      "/timesheets",        // Cross-service HR
      "/contracts",         // Cross-service HR
      "/compliance/templates", // Admin audit-template config
      "/holiday-quest",     // Marketing planner
      // 2026-04-30: removed from member sidebar so they log incidents
      // inside the service detail page (cross-service /incidents view is
      // for State Manager / Admin only).
      "/incidents",
      // 2026-04-30: EOS sidebar surfaces (vision/rocks/todos/issues/
      // meetings/scorecard) hidden for member — they engage with EOS via
      // the service detail tabs.
      "/vision",
      "/rocks",
      "/todos",
      "/issues",
      "/meetings",
      "/scorecard",
    ])("excludes cross-service / out-of-scope nav item %s", (href) => {
      expect(hrefs).not.toContain(href);
    });

    it.each([
      "/dashboard",
      "/services",          // their primary surface — drill in for everything
      "/onboarding",
      "/compliance",
      "/policies",
      // 2026-06-29: /leave retired from the sidebar — new leave requests
      // go through My Portal → Employment Hero. The route still resolves
      // for admins draining the historical backlog.
      "/knowledge",
      "/queue",
      "/my-portal",
      // /profile is reachable but not surfaced in the sidebar nav (avatar menu).
    ])("still includes core nav item %s", (href) => {
      expect(hrefs).toContain(href);
    });

    it("/services/[id] sub-paths inherit access via prefix match", () => {
      // canAccessPage uses pathMatches() which treats "/services" as a prefix
      // match for "/services/abc". Service detail (and its Roll Call /
      // Bookings / Children / Billing tabs) stay reachable.
      // (No nav item for /services/[id] — verified in canAccessPage tests.)
    });
  });
});

// ─── 2026-07-05: nav consolidation phase 1 ─────────────────
// Six handbook/help routes collapsed into /handbook, /admin/feedback merged
// into /feedback tabs, D&I + WGEA collapsed into /workforce-reports, and
// /incidents + the two /compliance sub-pages left the sidebar entirely.
describe("nav consolidation phase 1 (2026-07-05)", () => {
  const RETIRED_HREFS = [
    // → /handbook hub tabs
    "/guides",
    "/help",
    "/tools/the-amana-way",
    "/tools/handbook",
    "/tools/amana-way-one-pager",
    "/tools/employee-handbook",
    // → /feedback "Internal Feedback" tab
    "/admin/feedback",
    // → /workforce-reports hub tabs
    "/diversity-dashboard",
    "/wgea-report",
    // Removed from nav outright (pages still reachable by URL)
    "/incidents",
    "/compliance/templates",
    "/compliance/registers",
  ];

  it.each(RETIRED_HREFS)(
    "retired nav entry %s is gone from the raw nav list",
    (href) => {
      expect(navItems.some((i) => i.href === href)).toBe(false);
    },
  );

  it("owner sees the three consolidated hubs", () => {
    const hrefs = filterNavItems(navItems, "owner" as Role).map((i) => i.href);
    expect(hrefs).toContain("/handbook");
    expect(hrefs).toContain("/feedback");
    expect(hrefs).toContain("/workforce-reports");
  });

  it.each(["head_office", "admin"] as Role[])(
    "%s sees /workforce-reports (D&I + WGEA)",
    (role) => {
      const hrefs = filterNavItems(navItems, role).map((i) => i.href);
      expect(hrefs).toContain("/workforce-reports");
    },
  );

  it.each(["member", "staff", "marketing", "eos_viewer", "eos_implementer"] as Role[])(
    "%s does NOT see /workforce-reports",
    (role) => {
      const hrefs = filterNavItems(navItems, role).map((i) => i.href);
      expect(hrefs).not.toContain("/workforce-reports");
    },
  );

  it.each([
    "owner",
    "head_office",
    "admin",
    "marketing",
    "member",
    "staff",
    "eos_viewer",
    "eos_implementer",
  ] as Role[])("%s sees the Handbook & Help hub", (role) => {
    const hrefs = filterNavItems(navItems, role).map((i) => i.href);
    expect(hrefs).toContain("/handbook");
  });

  it("the /feedback entry is relabelled to plain 'Feedback'", () => {
    const item = navItems.find((i) => i.href === "/feedback");
    expect(item?.label).toBe("Feedback");
  });

  it("member and staff do not see /feedback (admin-tier page access)", () => {
    for (const role of ["member", "staff"] as Role[]) {
      const hrefs = filterNavItems(navItems, role).map((i) => i.href);
      expect(hrefs).not.toContain("/feedback");
    }
  });
});

// ─── Curated sidebar partition (2026-07-12) ─────────────────

describe("partitionNavSection", () => {
  const mk = (href: string, core?: boolean | Role[]): NavItem => ({
    href,
    label: href,
    icon: (() => null) as unknown as NavItem["icon"],
    section: "Test",
    ...(core !== undefined ? { core } : {}),
  });

  it("puts core: true items in core and unflagged items in overflow, preserving order", () => {
    const items = [mk("/a", true), mk("/b"), mk("/c", true), mk("/d")];
    const { core, overflow } = partitionNavSection(items, "admin");
    expect(core.map((i) => i.href)).toEqual(["/a", "/c"]);
    expect(overflow.map((i) => i.href)).toEqual(["/b", "/d"]);
  });

  it("role-list core applies only to listed roles", () => {
    // 3+ items so the tiny-section rule doesn't force everything visible
    const items = [mk("/marketing-only", ["marketing"]), mk("/x"), mk("/y")];
    const hrefs = (r: Role | undefined) =>
      partitionNavSection(items, r).core.map((i) => i.href);
    expect(hrefs("marketing")).toContain("/marketing-only");
    expect(hrefs("admin")).not.toContain("/marketing-only");
    expect(hrefs(undefined)).not.toContain("/marketing-only");
  });

  it("owner matches every role-list (superuser sees curated maximum)", () => {
    const items = [mk("/marketing-only", ["marketing"]), mk("/x"), mk("/y")];
    expect(partitionNavSection(items, "owner").core.map((i) => i.href)).toContain(
      "/marketing-only",
    );
  });

  it("promotes the active page into core so the current location is always visible", () => {
    const items = [mk("/hidden"), mk("/x"), mk("/y")];
    const { core } = partitionNavSection(items, "admin", { activeHref: "/hidden" });
    expect(core.map((i) => i.href)).toEqual(["/hidden"]);
    // nested route also counts as active
    const nested = partitionNavSection(items, "admin", { activeHref: "/hidden/child" });
    expect(nested.core.map((i) => i.href)).toEqual(["/hidden"]);
  });

  it("promotes badge-carrying items via forceShowHrefs", () => {
    const items = [mk("/bookings"), mk("/other"), mk("/third")];
    const { core, overflow } = partitionNavSection(items, "admin", {
      forceShowHrefs: ["/bookings"],
    });
    expect(core.map((i) => i.href)).toEqual(["/bookings"]);
    expect(overflow.map((i) => i.href)).toEqual(["/other", "/third"]);
  });

  it("real config: admin core for Operations is the curated set", () => {
    const ops = filterNavItems(navItems, "admin").filter((i) => i.section === "Operations");
    const { core } = partitionNavSection(ops, "admin");
    expect(core.map((i) => i.href)).toEqual([
      "/services",
      "/bookings",
      "/financials",
      "/compliance",
    ]);
  });

  it("real config: every section keeps at least the Home items reachable for staff", () => {
    const home = filterNavItems(navItems, "staff").filter((i) => i.section === "Home");
    const { overflow } = partitionNavSection(home, "staff");
    expect(overflow).toHaveLength(0); // Home is never hidden behind a toggle
  });
});

describe("partitionNavSection — tiny sections", () => {
  it("sections with two or fewer items show everything (no toggle)", () => {
    const mk = (href: string): NavItem => ({
      href,
      label: href,
      icon: (() => null) as unknown as NavItem["icon"],
      section: "Tiny",
    });
    const { core, overflow } = partitionNavSection([mk("/a"), mk("/b")], "member");
    expect(core).toHaveLength(2);
    expect(overflow).toHaveLength(0);
  });
});

describe("stage-1 nav folds (2026-07-12)", () => {
  const FOLDED = [
    "/assistant",
    "/tools/ccs-calculator",
    "/data-room",
    "/admin/ai-drafts",
    "/directory",
    "/reports/board",
  ];

  it("folded items are hidden from the sidebar/top-nav", () => {
    for (const href of FOLDED) {
      const item = navItems.find((i) => i.href === href);
      expect(item, href).toBeDefined();
      expect(item!.hidden, href).toBe(true);
    }
  });

  it("folded items stay in filterNavItems so ⌘K and page titles keep working", () => {
    const hrefs = filterNavItems(navItems, "owner").map((i) => i.href);
    for (const href of FOLDED) {
      expect(hrefs, href).toContain(href);
    }
  });
});
