/**
 * Who may read a staff member's HR record.
 *
 * The multi-centre cases are the point of these tests. Comparing primary
 * `serviceId` on both sides — the first cut — quietly got two real
 * arrangements wrong: a Director covering a second centre, and an Educator
 * rostered at a centre other than the one they're based at. Both sides now
 * count active `UserServiceMembership` rows, and the Director additionally
 * counts centres they manage via `Service.managerId`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

import { canAccessStaffProfile, canViewStaffDocument } from "@/lib/staff-access";

/**
 * Wire up the three lookups the Director branch makes.
 *
 * @param viewer      the Director: their primary centre, centres they
 *                    manage, and centres they're attached to
 * @param targetLinks the staff member's active membership centres
 */
function mockScope(
  viewer: { primary?: string | null; managed?: string[]; memberships?: string[] },
  targetLinks: { userId: string; serviceIds: string[] },
) {
  prismaMock.user.findUnique.mockImplementation(
    ({ where }: { where?: { id?: string } }) =>
      Promise.resolve(
        where?.id === "dir-1" ? { serviceId: viewer.primary ?? null } : null,
      ),
  );
  prismaMock.service.findMany.mockResolvedValue(
    (viewer.managed ?? []).map((id) => ({ id })),
  );
  prismaMock.userServiceMembership.findMany.mockImplementation(
    ({ where }: { where?: { userId?: string; status?: string } }) => {
      if (where?.userId === "dir-1") {
        return Promise.resolve(
          (viewer.memberships ?? []).map((serviceId) => ({ serviceId })),
        );
      }
      if (where?.userId === targetLinks.userId) {
        return Promise.resolve(
          targetLinks.serviceIds.map((serviceId) => ({ serviceId })),
        );
      }
      return Promise.resolve([]);
    },
  );
}

describe("canAccessStaffProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.service.findMany.mockResolvedValue([]);
    prismaMock.userServiceMembership.findMany.mockResolvedValue([]);
  });

  it("always allows a staff member to see their own record", async () => {
    expect(
      await canAccessStaffProfile("u-1", "staff", { id: "u-1", serviceId: "svc-a" }),
    ).toBe(true);
  });

  it.each(["owner", "admin", "head_office"])("allows %s org-wide", async (role) => {
    expect(
      await canAccessStaffProfile("a-1", role, { id: "u-9", serviceId: "svc-a" }),
    ).toBe(true);
  });

  it("denies an Educator at the same centre", async () => {
    // Sitting next to someone is not a reason to read their contract.
    mockScope({ primary: "svc-a" }, { userId: "u-9", serviceIds: [] });
    expect(
      await canAccessStaffProfile("edu-1", "staff", { id: "u-9", serviceId: "svc-a" }),
    ).toBe(false);
  });

  it("allows a Director at the staff member's primary centre", async () => {
    mockScope({ primary: "svc-a" }, { userId: "u-9", serviceIds: [] });
    expect(
      await canAccessStaffProfile("dir-1", "member", { id: "u-9", serviceId: "svc-a" }),
    ).toBe(true);
  });

  it("denies a Director at an unrelated centre", async () => {
    mockScope({ primary: "svc-a" }, { userId: "u-9", serviceIds: [] });
    expect(
      await canAccessStaffProfile("dir-1", "member", { id: "u-9", serviceId: "svc-b" }),
    ).toBe(false);
  });

  // ── The cases the primary-only comparison got wrong ────────────────

  it("allows a Director covering a second centre via their own membership", async () => {
    mockScope(
      { primary: "svc-a", memberships: ["svc-b"] },
      { userId: "u-9", serviceIds: [] },
    );
    expect(
      await canAccessStaffProfile("dir-1", "member", { id: "u-9", serviceId: "svc-b" }),
    ).toBe(true);
  });

  it("allows a Director who manages the centre via Service.managerId", async () => {
    mockScope(
      { primary: "svc-a", managed: ["svc-b"] },
      { userId: "u-9", serviceIds: [] },
    );
    expect(
      await canAccessStaffProfile("dir-1", "member", { id: "u-9", serviceId: "svc-b" }),
    ).toBe(true);
  });

  it("allows a Director when the STAFF member is attached to their centre", async () => {
    // Educator based at svc-b but also rostered at svc-a — the Director of
    // svc-a has them on shift and needs to check their WWCC.
    mockScope({ primary: "svc-a" }, { userId: "u-9", serviceIds: ["svc-a"] });
    expect(
      await canAccessStaffProfile("dir-1", "member", { id: "u-9", serviceId: "svc-b" }),
    ).toBe(true);
  });

  it("ignores inactive memberships on both sides", async () => {
    // The mock only answers for status: "active", so an ended membership
    // contributes nothing — assert the query actually filters on it.
    mockScope({ primary: "svc-a" }, { userId: "u-9", serviceIds: [] });
    await canAccessStaffProfile("dir-1", "member", { id: "u-9", serviceId: "svc-b" });

    for (const call of prismaMock.userServiceMembership.findMany.mock.calls) {
      expect(call[0].where.status).toBe("active");
    }
  });

  it("denies when the Director has no centre at all", async () => {
    mockScope({ primary: null }, { userId: "u-9", serviceIds: [] });
    expect(
      await canAccessStaffProfile("dir-1", "member", { id: "u-9", serviceId: "svc-a" }),
    ).toBe(false);
  });

  it("denies when neither side has a centre (no null === null match)", async () => {
    mockScope({ primary: null }, { userId: "u-9", serviceIds: [] });
    expect(
      await canAccessStaffProfile("dir-1", "member", { id: "u-9", serviceId: null }),
    ).toBe(false);
  });
});

describe("canViewStaffDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.service.findMany.mockResolvedValue([]);
    prismaMock.userServiceMembership.findMany.mockResolvedValue([]);
  });

  it("allows the assignee", async () => {
    expect(
      await canViewStaffDocument("u-1", "staff", {
        uploadedById: "admin-1",
        assignedToId: "u-1",
      }),
    ).toBe(true);
  });

  it("allows the uploader", async () => {
    expect(
      await canViewStaffDocument("u-1", "staff", {
        uploadedById: "u-1",
        assignedToId: "u-9",
      }),
    ).toBe(true);
  });

  it("returns false for a document with no assignee", async () => {
    // Not a personal document — the caller's own centre rules decide.
    expect(
      await canViewStaffDocument("u-1", "member", {
        uploadedById: "admin-1",
        assignedToId: null,
      }),
    ).toBe(false);
  });

  it("carries the widened centre scope through to documents", async () => {
    prismaMock.user.findUnique.mockImplementation(
      ({ where }: { where?: { id?: string } }) => {
        if (where?.id === "dir-1") return Promise.resolve({ serviceId: "svc-a" });
        if (where?.id === "u-9") {
          return Promise.resolve({ id: "u-9", serviceId: "svc-b" });
        }
        return Promise.resolve(null);
      },
    );
    prismaMock.service.findMany.mockResolvedValue([]);
    prismaMock.userServiceMembership.findMany.mockImplementation(
      ({ where }: { where?: { userId?: string } }) =>
        Promise.resolve(
          where?.userId === "dir-1" ? [{ serviceId: "svc-b" }] : [],
        ),
    );

    expect(
      await canViewStaffDocument("dir-1", "member", {
        uploadedById: "admin-1",
        assignedToId: "u-9",
      }),
    ).toBe(true);
  });

  it("denies a Director with no overlapping centre", async () => {
    prismaMock.user.findUnique.mockImplementation(
      ({ where }: { where?: { id?: string } }) => {
        if (where?.id === "dir-1") return Promise.resolve({ serviceId: "svc-a" });
        if (where?.id === "u-9") {
          return Promise.resolve({ id: "u-9", serviceId: "svc-b" });
        }
        return Promise.resolve(null);
      },
    );
    expect(
      await canViewStaffDocument("dir-1", "member", {
        uploadedById: "admin-1",
        assignedToId: "u-9",
      }),
    ).toBe(false);
  });
});
