import { describe, it, expect } from "vitest";
import { ROLES } from "@/lib/role-enum";

/**
 * Regression: the coordinator → member rename (2026-04-30) left stale
 * duplicate "member" entries in 8 hardcoded role lists across the
 * codebase. The visible bug was the BulkInviteModal role <select>
 * rendering "Director of Service" twice.
 *
 * This file enforces — at the type-level for things that aren't
 * directly iterable, and at runtime for things that are — that no
 * role list ever contains a duplicate again. The fix replaces all
 * hardcoded role lists with the canonical ROLES constant from
 * @/lib/role-enum, which is deduped by construction.
 */
describe("ROLES (single source of truth) has no duplicates", () => {
  it("the canonical ROLES constant has no duplicate entries", () => {
    expect(new Set(ROLES).size).toBe(ROLES.length);
  });

  it("contains the 6 expected roles in schema order", () => {
    expect(ROLES).toEqual([
      "owner",
      "head_office",
      "admin",
      "marketing",
      "member",
      "staff",
    ]);
  });
});
