import { describe, it, expect } from "vitest";
import { buildListWhere, isValidSort } from "@/lib/employees/build-list-where";

describe("buildListWhere", () => {
  it("returns a baseline where clause with no filters", () => {
    const out = buildListWhere({ params: {}, scopedServiceIds: null });
    expect(out).toEqual({});
  });

  it("applies search across name + email (case-insensitive)", () => {
    const out = buildListWhere({
      params: { q: "ali" },
      scopedServiceIds: null,
    });
    expect(out.OR).toEqual([
      { name: { contains: "ali", mode: "insensitive" } },
      { email: { contains: "ali", mode: "insensitive" } },
    ]);
  });

  it("applies status=active filter (active && lastLoginAt!=null)", () => {
    const out = buildListWhere({
      params: { status: "active" },
      scopedServiceIds: null,
    });
    expect(out.active).toBe(true);
    expect(out.lastLoginAt).toEqual({ not: null });
  });

  it("applies status=pending filter (active && lastLoginAt==null)", () => {
    const out = buildListWhere({
      params: { status: "pending" },
      scopedServiceIds: null,
    });
    expect(out.active).toBe(true);
    expect(out.lastLoginAt).toBe(null);
  });

  it("applies status=deactivated filter", () => {
    const out = buildListWhere({
      params: { status: "deactivated" },
      scopedServiceIds: null,
    });
    expect(out.active).toBe(false);
  });

  it("hides deactivated by default when no status filter is passed", () => {
    const out = buildListWhere({
      params: {},
      scopedServiceIds: null,
      hideDeactivatedByDefault: true,
    });
    expect(out.active).toBe(true);
  });

  it("applies multi-select serviceId filter (s=svc-1,svc-2)", () => {
    const out = buildListWhere({
      params: { s: "svc-1,svc-2" },
      scopedServiceIds: null,
    });
    expect(out.serviceId).toEqual({ in: ["svc-1", "svc-2"] });
  });

  it("applies multi-select role filter (r=staff,member)", () => {
    const out = buildListWhere({
      params: { r: "staff,member" },
      scopedServiceIds: null,
    });
    expect(out.role).toEqual({ in: ["staff", "member"] });
  });

  it("intersects scopedServiceIds with the s= filter (defense in depth)", () => {
    // If the caller is scoped to [svc-1] but tries to filter by s=svc-2,
    // the intersection is empty — should produce serviceId in [].
    const out = buildListWhere({
      params: { s: "svc-2" },
      scopedServiceIds: ["svc-1"],
    });
    expect(out.serviceId).toEqual({ in: [] });
  });

  it("uses scopedServiceIds when no s= filter is passed", () => {
    const out = buildListWhere({
      params: {},
      scopedServiceIds: ["svc-1", "svc-2"],
    });
    expect(out.serviceId).toEqual({ in: ["svc-1", "svc-2"] });
  });
});

describe("isValidSort", () => {
  it("accepts whitelisted sort columns", () => {
    expect(isValidSort("name")).toBe(true);
    expect(isValidSort("role")).toBe(true);
    expect(isValidSort("service")).toBe(true);
    expect(isValidSort("status")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isValidSort("email")).toBe(false); // not whitelisted
    expect(isValidSort("password")).toBe(false);
    expect(isValidSort("")).toBe(false);
    expect(isValidSort("name; DROP TABLE users")).toBe(false);
  });
});
