import { describe, it, expect } from "vitest";
import type { Session } from "next-auth";
import { getServiceScope } from "@/lib/service-scope";
import { getCentreScope } from "@/lib/centre-scope";

// 2026-06-23: EOS roles (viewer / implementer) are organisation-wide —
// they coach/run EOS across every centre, so they must NOT be centre- or
// service-scoped. Before this fix, getCentreScope dropped them to an empty
// scope (`__no_access__`), so Rocks/Issues/etc. came back blank.

function sess(role: string, serviceId: string | null = null): Session {
  return {
    user: { id: "u1", role, serviceId, email: "u1@x.test", name: "u1" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  } as unknown as Session;
}

describe("getCentreScope — EOS roles are org-wide", () => {
  it("eos_implementer → serviceIds null (no centre filter)", async () => {
    expect(await getCentreScope(sess("eos_implementer"))).toEqual({ serviceIds: null });
  });

  it("eos_viewer → serviceIds null (no centre filter)", async () => {
    expect(await getCentreScope(sess("eos_viewer"))).toEqual({ serviceIds: null });
  });
});

describe("getServiceScope — EOS roles are unscoped even with a serviceId", () => {
  it("eos_implementer with a stray serviceId → null", () => {
    expect(getServiceScope(sess("eos_implementer", "svc1"))).toBeNull();
  });

  it("eos_viewer with a stray serviceId → null", () => {
    expect(getServiceScope(sess("eos_viewer", "svc1"))).toBeNull();
  });
});
