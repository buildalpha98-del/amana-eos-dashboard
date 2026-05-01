import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../../helpers/auth-mock";

// Intercept next/navigation to throw recognizable errors for notFound/redirect.
// These need to be mocked before importing page.tsx so calls inside it throw.
vi.mock("next/navigation", () => ({
  notFound: () => {
    const err = new Error("NEXT_NOT_FOUND");
    (err as Error & { __nextNotFound: boolean }).__nextNotFound = true;
    throw err;
  },
  redirect: (to: string) => {
    const err = new Error(`NEXT_REDIRECT:${to}`);
    (err as Error & { __nextRedirect: string }).__nextRedirect = to;
    throw err;
  },
}));

// Stub the client tab component since it renders DOM-only pieces (hooks)
vi.mock("@/components/staff/StaffProfileTabs", () => ({
  StaffProfileTabs: ({ activeTab }: { activeTab: string }) => {
    return { type: "div", props: { "data-testid": "tabs", "data-active": activeTab } };
  },
}));

import StaffProfilePage, {
  canAccessProfile,
} from "@/app/(dashboard)/staff/[id]/page";

function wrap<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

function makeTargetUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    name: "Target Person",
    email: "target@test.com",
    role: "staff",
    avatar: null,
    active: true,
    serviceId: "svc-1",
    service: { id: "svc-1", name: "Amana Centre", code: "AMANA" },
    phone: null,
    dateOfBirth: null,
    addressStreet: null,
    addressSuburb: null,
    addressState: null,
    addressPostcode: null,
    startDate: new Date("2024-01-01"),
    probationEndDate: null,
    employmentType: "full_time",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function setupCommonMocks() {
  // Return empty arrays / null for every profile sub-query
  prismaMock.emergencyContact.findMany.mockResolvedValue([]);
  prismaMock.employmentContract.findFirst.mockResolvedValue(null);
  prismaMock.leaveBalance.findMany.mockResolvedValue([]);
  prismaMock.leaveRequest.findMany.mockResolvedValue([]);
  prismaMock.timesheetEntry.findMany.mockResolvedValue([]);
  prismaMock.staffQualification.findMany.mockResolvedValue([]);
  prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
  prismaMock.document.findMany.mockResolvedValue([]);
  prismaMock.rock.count.mockResolvedValue(0);
  prismaMock.todo.count.mockResolvedValue(0);
  prismaMock.rosterShift.findFirst.mockResolvedValue(null);
}

// ---------------------------------------------------------------------------
// canAccessProfile — unit tests of the access-control function itself
// ---------------------------------------------------------------------------

describe("canAccessProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows user to view their own profile regardless of role", async () => {
    const result = await canAccessProfile("u1", "staff", { id: "u1", serviceId: "svc-1" });
    expect(result).toBe(true);
  });

  it("allows admin to view any profile", async () => {
    const result = await canAccessProfile("admin-1", "admin", {
      id: "u2",
      serviceId: "svc-2",
    });
    expect(result).toBe(true);
  });

  it("allows owner to view any profile", async () => {
    const result = await canAccessProfile("owner-1", "owner", {
      id: "u2",
      serviceId: "svc-2",
    });
    expect(result).toBe(true);
  });

  it("allows head_office to view any profile", async () => {
    const result = await canAccessProfile("ho-1", "head_office", {
      id: "u2",
      serviceId: "svc-2",
    });
    expect(result).toBe(true);
  });

  it("allows coordinator to view staff at their own service", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ serviceId: "svc-1" });
    const result = await canAccessProfile("coord-1", "member", {
      id: "u2",
      serviceId: "svc-1",
    });
    expect(result).toBe(true);
  });

  it("blocks coordinator from viewing staff at other services", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ serviceId: "svc-1" });
    const result = await canAccessProfile("coord-1", "member", {
      id: "u2",
      serviceId: "svc-2",
    });
    expect(result).toBe(false);
  });

  it("blocks staff from viewing any other profile", async () => {
    const result = await canAccessProfile("u1", "staff", { id: "u2", serviceId: "svc-1" });
    expect(result).toBe(false);
  });

  // 2026-04-30: post coordinator-collapse, member inherits the same
  // single-service-scoping logic that coordinator had — they CAN view staff
  // at their own centre, but not at another. The pre-collapse assertion
  // ("member is blocked unconditionally") only made sense back when member
  // was the floor role. Re-asserts the cross-service block explicitly.
  it("blocks member from viewing staff at a different service", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ serviceId: "svc-2" });
    const result = await canAccessProfile("u1", "member", {
      id: "u2",
      serviceId: "svc-1",
    });
    expect(result).toBe(false);
  });

  it("blocks marketing from viewing any other profile", async () => {
    const result = await canAccessProfile("u1", "marketing", {
      id: "u2",
      serviceId: "svc-1",
    });
    expect(result).toBe(false);
  });

  it("blocks coordinator with no serviceId", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ serviceId: null });
    const result = await canAccessProfile("coord-1", "member", {
      id: "u2",
      serviceId: null,
    });
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// StaffProfilePage — integration-ish tests around the server component flow
// ---------------------------------------------------------------------------

describe("StaffProfilePage (server component)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("redirects to /login when unauthenticated", async () => {
    mockNoSession();
    await expect(
      StaffProfilePage({
        params: wrap({ id: "t1" }),
        searchParams: wrap({}),
      }),
    ).rejects.toThrowError(/NEXT_REDIRECT:\/login/);
  });

  it("calls notFound() when target user doesn't exist", async () => {
    mockSession({ id: "u1", name: "Viewer", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(
      StaffProfilePage({
        params: wrap({ id: "missing" }),
        searchParams: wrap({}),
      }),
    ).rejects.toThrowError(/NEXT_NOT_FOUND/);
  });

  it("renders profile for self", async () => {
    mockSession({ id: "t1", name: "Target", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue(makeTargetUser({ id: "t1" }));

    const result = (await StaffProfilePage({
      params: wrap({ id: "t1" }),
      searchParams: wrap({}),
    })) as { props?: { activeTab?: string } };
    // Mocked StaffProfileTabs returns a plain object; React will render it.
    // We just assert it was called with activeTab default.
    expect(result).toBeTruthy();
  });

  it("renders profile when admin views any staff", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue(makeTargetUser({ id: "t1" }));

    const result = await StaffProfilePage({
      params: wrap({ id: "t1" }),
      searchParams: wrap({}),
    });
    expect(result).toBeTruthy();
  });

  it("renders access-denied for staff viewing another staff profile", async () => {
    mockSession({ id: "u1", name: "Viewer", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue(makeTargetUser({ id: "t1" }));

    const result = (await StaffProfilePage({
      params: wrap({ id: "t1" }),
      searchParams: wrap({}),
    })) as { props?: { children?: unknown } };
    // Result should be a JSX element containing "Access denied" text.
    const asString = JSON.stringify(result);
    expect(asString).toContain("Access denied");
  });

  it("renders access-denied for coordinator viewing staff at another service", async () => {
    mockSession({ id: "coord-1", name: "Coord", role: "member" });
    // First findUnique call → target user
    // Second findUnique call → viewer's serviceId (for coordinator rule)
    prismaMock.user.findUnique.mockImplementation(async (args: { where?: { id?: string } }) => {
      if (args?.where?.id === "t1") {
        return makeTargetUser({ id: "t1", serviceId: "svc-other" });
      }
      if (args?.where?.id === "coord-1") {
        return { serviceId: "svc-1" };
      }
      return null;
    });

    const result = await StaffProfilePage({
      params: wrap({ id: "t1" }),
      searchParams: wrap({}),
    });
    const asString = JSON.stringify(result);
    expect(asString).toContain("Access denied");
  });

  it("coerces invalid tab param to overview", async () => {
    mockSession({ id: "t1", name: "Target", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue(makeTargetUser({ id: "t1" }));

    const result = (await StaffProfilePage({
      params: wrap({ id: "t1" }),
      searchParams: wrap({ tab: "not-a-tab" }),
    })) as { props?: Record<string, unknown> };
    // The mocked StaffProfileTabs receives activeTab as a prop — React stringifies
    // the element so "activeTab":"overview" ends up in the serialized tree.
    const asString = JSON.stringify(result);
    expect(asString).toContain('"activeTab":"overview"');
  });

  it("passes through valid tab param", async () => {
    mockSession({ id: "t1", name: "Target", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue(makeTargetUser({ id: "t1" }));

    const result = (await StaffProfilePage({
      params: wrap({ id: "t1" }),
      searchParams: wrap({ tab: "compliance" }),
    })) as { props?: Record<string, unknown> };
    const asString = JSON.stringify(result);
    expect(asString).toContain('"activeTab":"compliance"');
  });
});
