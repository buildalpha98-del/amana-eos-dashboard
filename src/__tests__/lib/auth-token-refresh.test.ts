/**
 * The periodic (5-minute) JWT refresh in `authOptions.callbacks.jwt`.
 *
 * 2026-09-15 regression cover. `role`, `serviceId` and `state` were written
 * only in the sign-in branch, so nothing carried a role change into a live
 * session: PATCH /api/users didn't bump `tokenVersion`, and this refresh
 * didn't re-read the role. Promoting someone to State Manager left them a
 * Member in their own browser indefinitely; revoking an admin's role left
 * their live session fully privileged.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
  resetRateLimit: vi.fn(),
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/org-settings", () => ({
  getOrgSettings: vi.fn(async () => ({ rolePageOverrides: {} })),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Map()),
}));

import { authOptions } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jwt = (args: any) => (authOptions.callbacks!.jwt as any)(args);

const SIX_MINUTES_AGO = Date.now() - 6 * 60 * 1000;

/** A token as it looks mid-session, due for its periodic re-check. */
function staleToken(overrides: Record<string, unknown> = {}) {
  return {
    id: "u-1",
    role: "member",
    serviceId: "svc-old",
    state: "VIC",
    tokenVersion: 1,
    tokenVersionCheckedAt: SIX_MINUTES_AGO,
    loginAt: Date.now(),
    rememberMe: true,
    ...overrides,
  };
}

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    tokenVersion: 1,
    active: true,
    role: "member",
    serviceId: "svc-old",
    state: "VIC",
    inductionStatus: "cleared",
    inductionGraceUntil: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("jwt callback: periodic identity refresh", () => {
  it("carries a promotion into the live session without a re-login", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      dbUser({ role: "head_office" }),
    );
    const token = await jwt({ token: staleToken() });
    expect(token.role).toBe("head_office");
    expect(token.exp).toBeUndefined(); // not forced to log out
  });

  it("carries a REVOCATION into the live session too", async () => {
    prismaMock.user.findUnique.mockResolvedValue(dbUser({ role: "staff" }));
    const token = await jwt({ token: staleToken({ role: "admin" }) });
    expect(token.role).toBe("staff");
  });

  it("refreshes the centre and state a user is scoped to", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      dbUser({ serviceId: "svc-new", state: "NSW" }),
    );
    const token = await jwt({ token: staleToken() });
    expect(token.serviceId).toBe("svc-new");
    expect(token.state).toBe("NSW");
  });

  it("does not re-read the database before the 5-minute window is up", async () => {
    const token = await jwt({
      token: staleToken({ tokenVersionCheckedAt: Date.now() }),
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(token.role).toBe("member"); // unchanged
  });

  it("still expires the token when the user is deactivated", async () => {
    prismaMock.user.findUnique.mockResolvedValue(dbUser({ active: false }));
    const token = await jwt({ token: staleToken() });
    expect(token.exp).toBe(0);
  });

  it("still expires the token when tokenVersion has moved on", async () => {
    prismaMock.user.findUnique.mockResolvedValue(dbUser({ tokenVersion: 2 }));
    const token = await jwt({ token: staleToken() });
    expect(token.exp).toBe(0);
  });

  it("keeps the session alive when the database is unreachable", async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error("ECONNREFUSED"));
    const token = await jwt({ token: staleToken() });
    expect(token.exp).toBeUndefined();
    expect(token.role).toBe("member");
  });

  it("looks up the page override with the NEW role, not the old one", async () => {
    const { getOrgSettings } = await import("@/lib/org-settings");
    vi.mocked(getOrgSettings).mockResolvedValue({
      rolePageOverrides: { head_office: ["/team"], member: ["/my-portal"] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    prismaMock.user.findUnique.mockResolvedValue(
      dbUser({ role: "head_office" }),
    );
    const token = await jwt({ token: staleToken() });
    expect(token.rolePageOverride).toEqual(["/team"]);
  });
});
