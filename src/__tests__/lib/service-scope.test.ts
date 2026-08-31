import { describe, it, expect } from "vitest";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import type { Session } from "next-auth";

function sess(role: string, serviceId: string | null = "svc1"): Session {
  return {
    user: { id: "u1", role, serviceId, email: "u1@x.test", name: "u1" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  } as unknown as Session;
}

describe("getServiceScope — full role matrix (4b widening)", () => {
  it("owner → null (cross-service)", () => {
    expect(getServiceScope(sess("owner"))).toBeNull();
  });

  it("head_office → null", () => {
    expect(getServiceScope(sess("head_office"))).toBeNull();
  });

  it("admin → null (State Managers use getStateScope separately)", () => {
    expect(getServiceScope(sess("admin"))).toBeNull();
  });

  it("coordinator with serviceId → serviceId (narrowed post-4b)", () => {
    expect(getServiceScope(sess("member", "svc1"))).toBe("svc1");
  });

  it("coordinator without serviceId → null (fail open; flagged in audit)", () => {
    expect(getServiceScope(sess("member", null))).toBeNull();
  });

  it("marketing with serviceId → serviceId (narrowed post-4b)", () => {
    expect(getServiceScope(sess("marketing", "svc1"))).toBe("svc1");
  });

  it("marketing without serviceId → null", () => {
    expect(getServiceScope(sess("marketing", null))).toBeNull();
  });

  it("member with serviceId → serviceId (unchanged)", () => {
    expect(getServiceScope(sess("member", "svc1"))).toBe("svc1");
  });

  it("staff with serviceId → serviceId (unchanged)", () => {
    expect(getServiceScope(sess("staff", "svc1"))).toBe("svc1");
  });

  it("null session → null", () => {
    expect(getServiceScope(null)).toBeNull();
  });
});

describe("getStateScope — retired; always null", () => {
  function sessWithState(role: string, state: string | null): Session {
    return {
      user: {
        id: "u1",
        role,
        serviceId: null,
        state,
        email: "u1@x.test",
        name: "u1",
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    } as unknown as Session;
  }

  it("admin with a state → still null: admins see every centre", () => {
    // Changed 2026-08-04. State scoping and centre-membership scoping
    // were two systems, and this one silently overrode the other: an
    // admin assigned to every centre saw one state's, while the access
    // screen showed assignments that did nothing.
    expect(getStateScope(sessWithState("admin", "VIC"))).toBeNull();
  });

  it("admin without state → null", () => {
    expect(getStateScope(sessWithState("admin", null))).toBeNull();
  });

  it("owner with state → null (owners use serviceScope)", () => {
    expect(getStateScope(sessWithState("owner", "VIC"))).toBeNull();
  });

  it("null session → null", () => {
    expect(getStateScope(null)).toBeNull();
  });
});
