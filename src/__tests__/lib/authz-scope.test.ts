import { describe, it, expect } from "vitest";
import type { Session } from "next-auth";
import {
  canAccessService,
  assertServiceAccess,
  serviceScopeFilter,
  resolveServiceIdFilter,
  NO_SERVICE_MATCH,
} from "@/lib/authz-scope";

function sess(role: string, serviceId: string | null = null): Session {
  return {
    user: { id: "u1", role, serviceId },
    expires: "2099-01-01",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("authz-scope: canAccessService", () => {
  it("admin roles access any centre", () => {
    for (const role of ["owner", "head_office", "admin"]) {
      expect(canAccessService(sess(role, null), "svc-A")).toBe(true);
      expect(canAccessService(sess(role, "svc-Z"), "svc-A")).toBe(true);
    }
  });

  it("member/staff access ONLY their own centre", () => {
    expect(canAccessService(sess("member", "svc-A"), "svc-A")).toBe(true);
    expect(canAccessService(sess("staff", "svc-A"), "svc-A")).toBe(true);
    expect(canAccessService(sess("member", "svc-A"), "svc-B")).toBe(false);
    expect(canAccessService(sess("staff", "svc-A"), "svc-B")).toBe(false);
  });

  it("fails closed for non-admin with no serviceId (marketing/eos/unassigned)", () => {
    for (const role of ["marketing", "eos_viewer", "eos_implementer", "member", "staff"]) {
      expect(canAccessService(sess(role, null), "svc-A")).toBe(false);
    }
  });

  it("fails closed when the record has no serviceId and viewer is non-admin", () => {
    expect(canAccessService(sess("member", "svc-A"), null)).toBe(false);
    // admin still allowed even for null-service records
    expect(canAccessService(sess("admin", null), null)).toBe(true);
  });

  it("no session is denied", () => {
    expect(canAccessService(null, "svc-A")).toBe(false);
  });
});

describe("authz-scope: assertServiceAccess", () => {
  it("throws 403 when access is denied", () => {
    expect(() => assertServiceAccess(sess("staff", "svc-A"), "svc-B")).toThrowError(
      /forbidden/i,
    );
  });
  it("does not throw when access is allowed", () => {
    expect(() => assertServiceAccess(sess("staff", "svc-A"), "svc-A")).not.toThrow();
    expect(() => assertServiceAccess(sess("owner"), "svc-A")).not.toThrow();
  });
});

describe("authz-scope: serviceScopeFilter", () => {
  it("admin gets no restriction", () => {
    expect(serviceScopeFilter(sess("admin", "svc-A"))).toEqual({});
  });
  it("non-admin is pinned to their own serviceId", () => {
    expect(serviceScopeFilter(sess("member", "svc-A"))).toEqual({ serviceId: "svc-A" });
  });
  it("non-admin without serviceId returns the empty-match sentinel", () => {
    expect(serviceScopeFilter(sess("marketing", null))).toEqual({
      serviceId: NO_SERVICE_MATCH,
    });
  });
});

describe("authz-scope: resolveServiceIdFilter (list routes with ?serviceId=)", () => {
  it("admin honours the requested serviceId, or undefined for all", () => {
    expect(resolveServiceIdFilter(sess("admin"), "svc-B")).toBe("svc-B");
    expect(resolveServiceIdFilter(sess("admin"), null)).toBeUndefined();
  });

  it("non-admin ALWAYS resolves to their own serviceId, ignoring a wider request", () => {
    // the buildListWhere scope-escape: requesting another centre must NOT widen
    expect(resolveServiceIdFilter(sess("member", "svc-A"), "svc-B")).toBe(NO_SERVICE_MATCH);
    // requesting own centre is fine
    expect(resolveServiceIdFilter(sess("member", "svc-A"), "svc-A")).toBe("svc-A");
    // no request → own centre
    expect(resolveServiceIdFilter(sess("member", "svc-A"), null)).toBe("svc-A");
  });

  it("non-admin without serviceId can never widen", () => {
    expect(resolveServiceIdFilter(sess("marketing", null), "svc-A")).toBe(NO_SERVICE_MATCH);
    expect(resolveServiceIdFilter(sess("marketing", null), null)).toBe(NO_SERVICE_MATCH);
  });
});
