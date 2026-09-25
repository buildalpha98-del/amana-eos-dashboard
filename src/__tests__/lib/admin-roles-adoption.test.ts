import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { globSync } from "glob";
import { ADMIN_ROLES, ADMIN_ROLES_WITH_EOS } from "@/lib/role-permissions";

/**
 * Guard for the 2026-09-25 sweep.
 *
 * `ADMIN_ROLES` exists specifically to stop the admin tier drifting across
 * call sites, but 212 of 250 API files had inlined `["owner", "head_office",
 * "admin"]` instead of using it. That is the "build infrastructure, apply it
 * to 15%" anti-pattern, and it is how the `eos` role ended up with admin-level
 * PAGE access while 200-odd routes silently 403'd it.
 *
 * This test fails the moment a new hardcoded copy appears.
 */

const ADMIN_ARRAY = /\[\s*"owner",\s*"(?:head_office",\s*"admin|admin",\s*"head_office)"\s*\]/;

/**
 * Deliberate exceptions. These name a *different* concept that happens to have
 * the same membership today, so collapsing them onto ADMIN_ROLES would conflate
 * two rules that are free to diverge.
 */
const ALLOWED = new Set<string>([
  // Ambassador submission state machine: who may move a record to
  // `sm_approved`. A workflow transition rule, not the admin tier.
  "src/app/api/ambassadors/records/[id]/transition/route.ts",
]);

describe("ADMIN_ROLES adoption", () => {
  const files = globSync("src/app/api/**/*.ts", { cwd: process.cwd() });

  it("finds API route files to check", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("has no hardcoded admin-role arrays left in the API layer", () => {
    const offenders = files.filter(
      (f) => !ALLOWED.has(f) && ADMIN_ARRAY.test(readFileSync(f, "utf8")),
    );

    expect(
      offenders,
      `Use ADMIN_ROLES from "@/lib/role-permissions" instead of inlining the ` +
        `array — \`roles: [...ADMIN_ROLES]\`, or \`isAdminRole(role)\` for an ` +
        `includes-style check. If the route backs a page the \`eos\` role can ` +
        `reach, use ADMIN_ROLES_WITH_EOS.`,
    ).toEqual([]);
  });

  it("keeps ADMIN_ROLES_WITH_EOS a strict superset of ADMIN_ROLES", () => {
    for (const role of ADMIN_ROLES) {
      expect(ADMIN_ROLES_WITH_EOS).toContain(role);
    }
    expect(ADMIN_ROLES_WITH_EOS).toContain("eos");
    expect(ADMIN_ROLES_WITH_EOS).toHaveLength(ADMIN_ROLES.length + 1);
  });
});
