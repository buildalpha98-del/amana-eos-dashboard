import { describe, it, expect } from "vitest";
import { canAccessPage, rolePageAccess, allPages } from "@/lib/role-permissions";

describe("canAccessPage /children/[id]", () => {
  it("is registered in allPages", () => {
    expect(allPages as readonly string[]).toContain("/children/[id]");
  });

  for (const role of [
    "owner",
    "head_office",
    "admin",
    "coordinator",
    "member",
    "staff",
    "marketing",
  ] as const) {
    it(`allows ${role} to access /children/[id]`, () => {
      expect(canAccessPage(role, "/children/[id]")).toBe(true);
    });

    it(`allows ${role} on a concrete child id path`, () => {
      expect(canAccessPage(role, "/children/abc123")).toBe(true);
    });

    it(`has /children/[id] entry in rolePageAccess.${role}`, () => {
      expect(rolePageAccess[role] as readonly string[]).toContain("/children/[id]");
    });
  }
});
