import { describe, it, expect } from "vitest";
import { computeFlagDefault } from "@/lib/useTeamsRedesignFlag";

describe("computeFlagDefault — env value parsing", () => {
  it("returns false when env is unset", () => {
    expect(computeFlagDefault("", "owner")).toBe(false);
    expect(computeFlagDefault("", null)).toBe(false);
  });

  it("returns false for explicit 'false'", () => {
    expect(computeFlagDefault("false", "owner")).toBe(false);
  });

  it("returns false for unknown values", () => {
    expect(computeFlagDefault("yes", "owner")).toBe(false);
    expect(computeFlagDefault("1", "owner")).toBe(false);
    expect(computeFlagDefault("on", "owner")).toBe(false);
  });

  it("treats 'true' as alias for 'all' (backward compat with PR #78)", () => {
    for (const role of ["owner", "admin", "member", "staff", null]) {
      expect(computeFlagDefault("true", role)).toBe(true);
    }
  });

  it("'all' enables for every role including no-session", () => {
    for (const role of ["owner", "head_office", "admin", "marketing", "member", "staff", null]) {
      expect(computeFlagDefault("all", role)).toBe(true);
    }
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(computeFlagDefault("ALL", "member")).toBe(true);
    expect(computeFlagDefault("  admin  ", "owner")).toBe(true);
    expect(computeFlagDefault("True", "staff")).toBe(true);
  });
});

describe("computeFlagDefault — admin-tier rollout phase", () => {
  it("'admin' enables for owner / head_office / admin only", () => {
    expect(computeFlagDefault("admin", "owner")).toBe(true);
    expect(computeFlagDefault("admin", "head_office")).toBe(true);
    expect(computeFlagDefault("admin", "admin")).toBe(true);
  });

  it("'admin' does not enable for non-admin-tier roles", () => {
    expect(computeFlagDefault("admin", "marketing")).toBe(false);
    expect(computeFlagDefault("admin", "member")).toBe(false);
    expect(computeFlagDefault("admin", "staff")).toBe(false);
  });

  it("'admin' is off when role is null (no session yet)", () => {
    // While the session is still loading we err on the side of the
    // legacy layout — flipping to the new layout mid-render after
    // the session resolves is a worse UX than waiting one tick.
    expect(computeFlagDefault("admin", null)).toBe(false);
  });
});
