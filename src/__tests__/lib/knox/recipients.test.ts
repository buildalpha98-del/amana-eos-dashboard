import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { resolveRecipients } from "@/lib/knox/recipients";
import type { ServiceLite } from "@/lib/knox/types";

interface FakeUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  active: boolean;
  state: string | null;
  serviceId: string | null;
  isCentreAccount: boolean;
}

interface FakeMembership {
  userId: string;
  serviceId: string;
  roleAtService: string;
  status: "active" | "inactive";
  endDate?: Date | null;
  user: FakeUser;
}

const service: ServiceLite = {
  id: "svc-1",
  name: "Arkana OSHC",
  state: "NSW",
  managerId: null,
};

function user(over: Partial<FakeUser> & { id: string }): FakeUser {
  return {
    name: `Name ${over.id}`,
    email: `${over.id}@amanaoshc.com.au`,
    role: "staff",
    active: true,
    state: null,
    serviceId: null,
    isCentreAccount: false,
    ...over,
  };
}

let users: FakeUser[] = [];
let memberships: FakeMembership[] = [];

type RoleFilter = string | { in: string[] };
interface UserWhere {
  id?: string;
  active?: boolean;
  isCentreAccount?: boolean;
  role?: RoleFilter;
  serviceId?: string;
}

function matchesRole(role: string, filter: RoleFilter | undefined): boolean {
  if (filter === undefined) return true;
  if (typeof filter === "string") return role === filter;
  return filter.in.includes(role);
}

function matchesUser(u: FakeUser, where: UserWhere): boolean {
  if (where.id !== undefined && u.id !== where.id) return false;
  if (where.active !== undefined && u.active !== where.active) return false;
  if (where.isCentreAccount !== undefined && u.isCentreAccount !== where.isCentreAccount) {
    return false;
  }
  if (where.serviceId !== undefined && u.serviceId !== where.serviceId) return false;
  return matchesRole(u.role, where.role);
}

interface MembershipWhere {
  serviceId?: string;
  status?: string;
  OR?: Array<{ endDate: null | { gt: Date } }>;
  roleAtService?: { contains: string; mode?: "insensitive" };
  user?: UserWhere;
}

function matchesMembership(m: FakeMembership, where: MembershipWhere): boolean {
  if (where.serviceId !== undefined && m.serviceId !== where.serviceId) return false;
  if (where.status !== undefined && m.status !== where.status) return false;
  if (where.OR) {
    const end = m.endDate ?? null;
    const ok = where.OR.some((c) => (c.endDate === null ? end === null : end !== null && end > c.endDate.gt));
    if (!ok) return false;
  }
  if (where.roleAtService) {
    const hay = where.roleAtService.mode === "insensitive" ? m.roleAtService.toLowerCase() : m.roleAtService;
    const needle = where.roleAtService.mode === "insensitive" ? where.roleAtService.contains.toLowerCase() : where.roleAtService.contains;
    if (!hay.includes(needle)) return false;
  }
  if (where.user && !matchesUser(m.user, where.user)) return false;
  return true;
}

const pick = ({ id, name, email }: FakeUser) => ({ id, name, email });

beforeEach(() => {
  users = [];
  memberships = [];
  prismaMock.user.findUnique.mockImplementation((async (args: { where: UserWhere }) => {
    const hit = users.find((u) => matchesUser(u, args.where));
    return hit ? pick(hit) : null;
  }) as never);
  prismaMock.user.findMany.mockImplementation((async (args: { where: UserWhere }) =>
    users.filter((u) => matchesUser(u, args.where)).map((u) => ({ ...pick(u), role: u.role, state: u.state }))) as never);
  prismaMock.userServiceMembership.findMany.mockImplementation((async (args: {
    where: MembershipWhere;
  }) =>
    memberships.filter((m) => matchesMembership(m, args.where)).map((m) => ({ user: pick(m.user) }))) as never);
});

describe("resolveRecipients", () => {
  it("director = Service.managerId when set and active", async () => {
    users = [
      user({ id: "mgr", role: "member" }),
      user({ id: "other-member", role: "member", serviceId: "svc-1" }),
    ];
    memberships = [
      { userId: "m2", serviceId: "svc-1", roleAtService: "Director", status: "active", user: user({ id: "m2" }) },
    ];

    const r = await resolveRecipients(prismaMock as never, { ...service, managerId: "mgr" });

    expect(r.directors.map((d) => d.id)).toEqual(["mgr"]);
    expect(r.noDirector).toBe(false);
    expect(r.directors[0]).toEqual({ id: "mgr", name: "Name mgr", email: "mgr@amanaoshc.com.au" });
  });

  it("falls back to active membership whose roleAtService matches /director/i", async () => {
    users = [user({ id: "mgr", active: false, role: "member" })];
    memberships = [
      { userId: "d1", serviceId: "svc-1", roleAtService: "director of service", status: "active", user: user({ id: "d1" }) },
      { userId: "e1", serviceId: "svc-1", roleAtService: "Educator", status: "active", user: user({ id: "e1" }) },
      { userId: "d2", serviceId: "svc-1", roleAtService: "Director", status: "inactive", user: user({ id: "d2" }) },
      { userId: "d3", serviceId: "svc-1", roleAtService: "Director", status: "active", user: user({ id: "d3", active: false }) },
      { userId: "d4", serviceId: "svc-2", roleAtService: "Director", status: "active", user: user({ id: "d4" }) },
    ];

    const r = await resolveRecipients(prismaMock as never, { ...service, managerId: "mgr" });

    expect(r.directors.map((d) => d.id)).toEqual(["d1"]);
    expect(r.noDirector).toBe(false);
  });

  it("falls back to role member with serviceId = service.id", async () => {
    users = [
      user({ id: "home", role: "member", serviceId: "svc-1" }),
      user({ id: "elsewhere", role: "member", serviceId: "svc-2" }),
      user({ id: "educator", role: "staff", serviceId: "svc-1" }),
    ];

    const r = await resolveRecipients(prismaMock as never, service);

    expect(r.directors.map((d) => d.id)).toEqual(["home"]);
    expect(r.noDirector).toBe(false);
  });

  it("noDirector true and directors empty when nothing resolves", async () => {
    users = [user({ id: "elsewhere", role: "member", serviceId: "svc-2" })];

    const r = await resolveRecipients(prismaMock as never, service);

    expect(r.directors).toEqual([]);
    expect(r.noDirector).toBe(true);
  });

  it("state managers filtered by service.state case-insensitively, else all head_office", async () => {
    users = [
      user({ id: "ho-nsw", role: "head_office", state: "nsw" }),
      user({ id: "ho-vic", role: "head_office", state: "VIC" }),
      user({ id: "ho-none", role: "head_office", state: null }),
    ];

    const matched = await resolveRecipients(prismaMock as never, { ...service, state: "NSW" });
    expect(matched.stateManagers.map((s) => s.id)).toEqual(["ho-nsw"]);

    const unmatched = await resolveRecipients(prismaMock as never, { ...service, state: "QLD" });
    expect(unmatched.stateManagers.map((s) => s.id).sort()).toEqual(["ho-none", "ho-nsw", "ho-vic"]);

    const noState = await resolveRecipients(prismaMock as never, { ...service, state: null });
    expect(noState.stateManagers.map((s) => s.id).sort()).toEqual(["ho-none", "ho-nsw", "ho-vic"]);
  });

  it("owners = role owner; inactive users (active false) excluded from every bucket; duplicates removed", async () => {
    users = [
      user({ id: "own1", role: "owner" }),
      user({ id: "own2", role: "owner", active: false }),
      user({ id: "ho-off", role: "head_office", state: "NSW", active: false }),
      user({ id: "ho-on", role: "head_office", state: "NSW" }),
      user({ id: "member-off", role: "member", serviceId: "svc-1", active: false }),
    ];
    // Two memberships for the same user (duplicate row) must collapse to one recipient.
    const d = user({ id: "dup" });
    memberships = [
      { userId: "dup", serviceId: "svc-1", roleAtService: "Director", status: "active", user: d },
      { userId: "dup", serviceId: "svc-1", roleAtService: "Assistant Director", status: "active", user: d },
    ];

    const r = await resolveRecipients(prismaMock as never, service);

    expect(r.owners.map((o) => o.id)).toEqual(["own1"]);
    expect(r.stateManagers.map((s) => s.id)).toEqual(["ho-on"]);
    expect(r.directors.map((x) => x.id)).toEqual(["dup"]);
  });

  it("never resolves a centre mailbox as director via any path", async () => {
    users = [
      user({ id: "mgr-box", role: "member", isCentreAccount: true, serviceId: "svc-1" }),
      user({ id: "home-box", role: "member", isCentreAccount: true, serviceId: "svc-1" }),
    ];
    memberships = [
      { userId: "mb", serviceId: "svc-1", roleAtService: "Director", status: "active", user: user({ id: "mb", isCentreAccount: true }) },
    ];

    const r = await resolveRecipients(prismaMock as never, { ...service, managerId: "mgr-box" });

    expect(r.directors).toEqual([]);
    expect(r.noDirector).toBe(true);
  });

  it("a real member is still found when a centre mailbox shares the service", async () => {
    users = [
      user({ id: "box", role: "member", isCentreAccount: true, serviceId: "svc-1" }),
      user({ id: "person", role: "member", serviceId: "svc-1" }),
    ];

    const r = await resolveRecipients(prismaMock as never, service);

    expect(r.directors.map((d) => d.id)).toEqual(["person"]);
    expect(r.noDirector).toBe(false);
  });

  it("excludes an ended membership but keeps one that ends in the future", async () => {
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);
    memberships = [
      { userId: "gone", serviceId: "svc-1", roleAtService: "Director", status: "active", endDate: past, user: user({ id: "gone" }) },
      { userId: "soon", serviceId: "svc-1", roleAtService: "Director", status: "active", endDate: future, user: user({ id: "soon" }) },
    ];

    const r = await resolveRecipients(prismaMock as never, service);

    expect(r.directors.map((d) => d.id)).toEqual(["soon"]);
  });

  it("a membership director takes precedence over the home-service member fallback", async () => {
    users = [user({ id: "home", role: "member", serviceId: "svc-1" })];
    memberships = [
      { userId: "dir", serviceId: "svc-1", roleAtService: "Director", status: "active", user: user({ id: "dir" }) },
    ];

    const r = await resolveRecipients(prismaMock as never, service);

    expect(r.directors.map((d) => d.id)).toEqual(["dir"]);
  });
});
