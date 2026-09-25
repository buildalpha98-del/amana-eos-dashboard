/**
 * State Manager (head_office) centre scoping.
 *
 * Regression coverage for 2026-09-15: head_office scope was the caller's
 * `UserServiceMembership` rows and nothing else. Those rows had never been
 * created in production, so `getCentreScope` returned `[]` — /team, the
 * services dropdown and the new-starter modal all rendered empty and a
 * State Manager could not onboard anyone.
 *
 * The fix unions the centres in the manager's `User.state` with their
 * explicit memberships. The union is the whole point: state must ADD to
 * memberships, never replace them. Replacing is exactly what broke admin
 * scoping on 2026-08-04 (see `getStateScope` in service-scope.ts).
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Session } from "next-auth";
import { prismaMock } from "../helpers/prisma-mock";
import { getCentreScope } from "@/lib/centre-scope";
import { stateMatchValues } from "@/lib/service-scope";

function sess(role: string, extra: Record<string, unknown> = {}): Session {
  return {
    user: { id: "u1", role, ...extra },
    expires: "2099-01-01",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/** Mock the two reads the head_office branch makes. */
function mockScope(opts: {
  memberships?: string[];
  state?: string | null;
  servicesByState?: Record<string, string[]>;
}) {
  prismaMock.userServiceMembership.findMany.mockResolvedValue(
    (opts.memberships ?? []).map((serviceId) => ({ serviceId })),
  );
  prismaMock.user.findUnique.mockResolvedValue({ state: opts.state ?? null });
  prismaMock.service.findMany.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any) => {
      const values: string[] = args?.where?.state?.in ?? [];
      const key = values[0];
      return (opts.servicesByState?.[key] ?? []).map((id) => ({ id }));
    },
  );
}

beforeEach(() => {
  prismaMock.userServiceMembership.findMany.mockReset();
  prismaMock.user.findUnique.mockReset();
  prismaMock.service.findMany.mockReset();
});

describe("getCentreScope: head_office", () => {
  it("returns every centre in the manager's state", async () => {
    mockScope({ state: "VIC", servicesByState: { VIC: ["svc-1", "svc-2", "svc-3"] } });
    const { serviceIds } = await getCentreScope(sess("head_office"));
    expect(serviceIds?.sort()).toEqual(["svc-1", "svc-2", "svc-3"]);
  });

  it("matches the state case-insensitively and by full name", async () => {
    mockScope({ state: "Victoria", servicesByState: { VIC: ["svc-1"] } });
    await getCentreScope(sess("head_office"));
    const where = prismaMock.service.findMany.mock.calls[0][0].where;
    expect(where.state.in).toEqual(["VIC", "Victoria"]);
    expect(where.state.mode).toBe("insensitive");
  });

  it("ADDS state centres to memberships — a membership outside the state survives", async () => {
    mockScope({
      memberships: ["svc-nsw-interstate"],
      state: "VIC",
      servicesByState: { VIC: ["svc-vic-1", "svc-vic-2"] },
    });
    const { serviceIds } = await getCentreScope(sess("head_office"));
    expect(serviceIds?.sort()).toEqual([
      "svc-nsw-interstate",
      "svc-vic-1",
      "svc-vic-2",
    ]);
  });

  it("de-duplicates a centre that is both a membership and in-state", async () => {
    mockScope({
      memberships: ["svc-1"],
      state: "NSW",
      servicesByState: { NSW: ["svc-1", "svc-2"] },
    });
    const { serviceIds } = await getCentreScope(sess("head_office"));
    expect(serviceIds?.sort()).toEqual(["svc-1", "svc-2"]);
  });

  it("falls back to memberships-only when User.state is null", async () => {
    mockScope({ memberships: ["svc-1"], state: null });
    const { serviceIds } = await getCentreScope(sess("head_office"));
    expect(serviceIds).toEqual(["svc-1"]);
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();
  });

  it("never returns null (org-wide) for a State Manager", async () => {
    mockScope({ state: "VIC", servicesByState: { VIC: ["svc-1"] } });
    const { serviceIds } = await getCentreScope(sess("head_office"));
    expect(serviceIds).not.toBeNull();
  });

  it("reads state from the DB, not the session — the session carries no state", async () => {
    mockScope({ state: "VIC", servicesByState: { VIC: ["svc-1"] } });
    const { serviceIds } = await getCentreScope(
      // A stale/absent session field must not win over the User row.
      sess("head_office", { state: "QLD" }),
    );
    expect(serviceIds).toEqual(["svc-1"]);
  });
});

describe("stateMatchValues", () => {
  it("expands an abbreviation to both spellings", () => {
    expect(stateMatchValues("NSW")).toEqual(["NSW", "New South Wales"]);
    expect(stateMatchValues("nsw")).toEqual(["NSW", "New South Wales"]);
  });

  it("expands a full name to both spellings", () => {
    expect(stateMatchValues("  western australia ")).toEqual([
      "WA",
      "Western Australia",
    ]);
  });

  it("returns an empty list for blank input — never widens a scope", () => {
    expect(stateMatchValues(null)).toEqual([]);
    expect(stateMatchValues(undefined)).toEqual([]);
    expect(stateMatchValues("   ")).toEqual([]);
  });

  it("passes an unrecognised value through rather than matching everything", () => {
    expect(stateMatchValues("Victoriaaa")).toEqual(["Victoriaaa"]);
  });
});
