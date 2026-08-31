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
    // the parent-portal radius-lg = 20px. Colors/radii live in a plain @theme
    // block (NOT `@theme inline` — inline freezes utilities to literal values,
    // disconnecting them from the .dark and [data-v2] var overrides).
    const themeBlock = globalsCss.match(/@theme\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(themeBlock).toMatch(/--radius-lg:\s*20px/);
  });

  it("keeps colors out of @theme inline so .dark overrides reach utilities", () => {
    const inlineBlocks = [...globalsCss.matchAll(/@theme inline\s*\{[\s\S]*?\n\}/g)]
      .map((m) => m[0])
      .join("\n");
    expect(inlineBlocks).not.toMatch(/--color-/);
    expect(inlineBlocks).not.toMatch(/--radius-/);
  });
});

describe("globals.css entry animations", () => {
  // A persistent translate/transform makes the animated element the
  // containing block for every `position: fixed` descendant — <main> uses
  // animate-slide-up, so this re-anchored every non-portaled modal/panel/
  // floating bar to <main> instead of the viewport (2026-08-10: clipped
  // New-request modal on /requests). Two halves to the fix, both pinned here:
  //   1. fill-mode must be `backwards` (NOT both/forwards) — a filling
  //      animation keeps its final EFFECT applied forever, and browsers
  //      normalise even a `none` keyframe endpoint to `0px`, which still
  //      creates a containing block.
  //   2. keyframes end at `none` (not `0 0`) as defence in depth.
  const keyframes = (name: string) =>
    globalsCss.match(new RegExp(`@keyframes ${name}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";

  it("entry utilities use fill-mode backwards, never both/forwards", () => {
    for (const name of ["fade-in", "slide-up", "slide-down", "scale-in"]) {
      const utility =
        globalsCss.match(
          new RegExp(`@utility animate-${name}\\s*\\{[^}]*\\}`),
        )?.[0] ?? "";
      expect(utility, name).toMatch(/animation:[^;]*backwards/);
      expect(utility, name).not.toMatch(/animation:[^;]*(both|forwards)/);
    }
  });

  it("slide-up ends at translate: none (not 0 0)", () => {
    const to = keyframes("slide-up").match(/to\s*\{[^}]*\}/)?.[0] ?? "";
    expect(to).toMatch(/translate:\s*none/);
  });

  it("slide-down and scale-in end at transform: none", () => {
    for (const name of ["slide-down", "scale-in"]) {
      const to = keyframes(name).match(/to\s*\{[^}]*\}/)?.[0] ?? "";
      expect(to, name).toMatch(/transform:\s*none/);
    }
  });

  it("no entry keyframes ends with a persistent identity translate/transform", () => {
    for (const name of ["fade-in", "slide-up", "slide-down", "scale-in"]) {
      const to = keyframes(name).match(/to\s*\{[^}]*\}/)?.[0] ?? "";
      expect(to, name).not.toMatch(/translate:\s*0/);
      expect(to, name).not.toMatch(/transform:\s*translate[XY]?\(0/);
      expect(to, name).not.toMatch(/transform:\s*scale\(1\)/);
    }
  });
});
