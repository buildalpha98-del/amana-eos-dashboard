// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guards against accidental regression of the v2 design-token scoping.
 * Parent + staff dashboards both opt into the v2 system via `data-v2="<name>"`,
 * and the staff-specific token overrides must be scoped to `data-v2="staff"`.
 *
 * This is a build-surface test, not a behaviour test — it asserts the CSS
 * contains the selectors we expect so that:
 *   1. Removing the `data-v2` attribute from ParentShell won't silently strip
 *      parent press affordances.
 *   2. Future refactors don't re-introduce the old `.parent-portal` scope
 *      (which made the palette unreachable from staff pages).
 *   3. Staff-dense overrides stay scoped to `[data-v2="staff"]` so they don't
 *      leak into parent portal surfaces.
 */

const globalsCss = readFileSync(
  resolve(__dirname, "..", "app", "globals.css"),
  "utf8",
);

describe("globals.css v2 scope", () => {
  it("uses [data-v2] for press affordance (not .parent-portal)", () => {
    expect(globalsCss).toContain("[data-v2] a[role=\"button\"]:active");
    expect(globalsCss).toContain("[data-v2] button:not([disabled]):active");
    expect(globalsCss).not.toMatch(/\.parent-portal\s+a\[role="button"\]:active/);
  });

  it("scopes staff-dense token overrides to [data-v2=\"staff\"]", () => {
    expect(globalsCss).toContain("[data-v2=\"staff\"] {");
  });

  it("staff tokens override radius-md to a smaller value than parent default", () => {
    const staffBlock = globalsCss.match(/\[data-v2="staff"\]\s*\{[^}]+\}/)?.[0] ?? "";
    expect(staffBlock).toMatch(/--radius-md:\s*10px/);
    // Parent default is 14px — make sure we actually tightened it
    expect(staffBlock).not.toMatch(/--radius-md:\s*14px/);
  });

  it("provides a warm-card-dense utility under the staff scope", () => {
    expect(globalsCss).toContain("[data-v2=\"staff\"] .warm-card-dense");
  });

  it("keeps core radius-lg parent default at 20px", () => {
    // The default theme block (outside any data-v2 selector) should still own
    // the parent-portal radius-lg = 20px. We look for it in @theme inline.
    const themeBlock = globalsCss.match(/@theme inline\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(themeBlock).toMatch(/--radius-lg:\s*20px/);
  });
});
