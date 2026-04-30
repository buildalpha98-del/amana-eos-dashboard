/**
 * Integration test: Authentication and role-based access control
 *
 * Tests role-based page access and feature permissions using the
 * role-permissions module against real role data.
 *
 * This test file uses unit-style testing (no DB) because the permissions
 * module is pure logic. It's placed in integration tests because it
 * validates critical business rules end-to-end.
 */

import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import {
  canAccessPage,
  hasFeature,
  hasMinRole,
  rolePageAccess,
} from "@/lib/role-permissions";

const ALL_ROLES: Role[] = [
  "owner",
  "head_office",
  "admin",
  "marketing",
  "coordinator",
  "member",
  "staff",
];

describe("Role-based route access", () => {
  it("staff cannot access admin routes", () => {
    const adminRoutes = ["/settings", "/team", "/financials", "/performance"];
    for (const route of adminRoutes) {
      expect(canAccessPage("staff", route)).toBe(false);
    }
  });

  it("marketing cannot access HR-admin routes", () => {
    // Marketing role legitimately has /leave (Sprint 1 — Akram requests
    // his own leave) but is denied the HR-admin surfaces (timesheets
    // approval, contract management, recruitment).
    const hrAdminRoutes = ["/timesheets", "/contracts", "/recruitment"];
    for (const route of hrAdminRoutes) {
      expect(canAccessPage("marketing", route)).toBe(false);
    }
    // /leave is intentionally allowed for marketing — request flow.
    expect(canAccessPage("marketing", "/leave")).toBe(true);
  });

  it("coordinator cannot access settings", () => {
    expect(canAccessPage("coordinator", "/settings")).toBe(false);
  });

  it("coordinator can access compliance and todos", () => {
    expect(canAccessPage("coordinator", "/compliance")).toBe(true);
    expect(canAccessPage("coordinator", "/todos")).toBe(true);
  });

  it("member cannot access marketing or tickets", () => {
    expect(canAccessPage("member", "/marketing")).toBe(false);
    expect(canAccessPage("member", "/tickets")).toBe(false);
  });
});

describe("Feature-level authorization", () => {
  it("only owner can manage API keys", () => {
    for (const role of ALL_ROLES) {
      if (role === "owner") {
        expect(hasFeature(role, "api_keys.manage")).toBe(true);
      } else {
        expect(hasFeature(role, "api_keys.manage")).toBe(false);
      }
    }
  });

  it("only owner can import users", () => {
    expect(hasFeature("owner", "users.import")).toBe(true);
    expect(hasFeature("admin", "users.import")).toBe(false);
    expect(hasFeature("head_office", "users.import")).toBe(false);
  });

  it("admin can manage users but not access settings page", () => {
    expect(hasFeature("admin", "users.create")).toBe(true);
    expect(hasFeature("admin", "users.edit_role")).toBe(true);
    expect(hasFeature("admin", "settings.view")).toBe(false);
  });

  it("staff can view and request leave", () => {
    expect(hasFeature("staff", "leave.view")).toBe(true);
    expect(hasFeature("staff", "leave.request")).toBe(true);
    expect(hasFeature("staff", "leave.approve")).toBe(false);
  });

  it("coordinator has member permissions plus compliance.create", () => {
    expect(hasFeature("coordinator", "compliance.view")).toBe(true);
    expect(hasFeature("coordinator", "compliance.create")).toBe(true);
    expect(hasFeature("member", "compliance.view")).toBe(true);
    expect(hasFeature("member", "compliance.create")).toBe(false);
  });
});

describe("Role hierarchy enforcement", () => {
  it("prevents privilege escalation: lower roles can't assume higher", () => {
    expect(hasMinRole("staff", "admin")).toBe(false);
    expect(hasMinRole("member", "admin")).toBe(false);
    expect(hasMinRole("coordinator", "admin")).toBe(false);
    expect(hasMinRole("marketing", "admin")).toBe(false);
  });

  it("owner always meets any minimum role requirement", () => {
    for (const role of ALL_ROLES) {
      expect(hasMinRole("owner", role)).toBe(true);
    }
  });
});
