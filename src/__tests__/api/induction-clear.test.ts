/**
 * POST /api/induction/clear — the admin release valve, and the wiring that
 * makes the gate escapable in the first place.
 *
 * Context (2026-09-17): the gate had no admin exit. `/signoff` only clears
 * someone already at `awaiting_signoff` with every blocker met, and
 * `/override` grants a rostering window without touching locked-mode. Anyone
 * in `new_starter`/`in_training` past their grace was stuck, and real
 * coordinators were locked out of their own centre with no way back in.
 *
 * The registry test at the bottom is the important one: it enumerates the
 * routes that resolve a blocker. A blocker the user can satisfy with nothing
 * re-evaluating it is a permanent lockout, which is how this happened twice.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
  ),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req",
}));

import { POST } from "@/app/api/induction/clear/route";

const ctx = { params: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  // withApiAuth checks the caller is still an active user before anything else.
  prismaMock.user.findUnique.mockResolvedValue({ active: true } as never);
});

/** Route lookups read the TARGET user; the auth check reads the CALLER. */
function targetUser(target: Record<string, unknown> | null) {
  prismaMock.user.findUnique.mockImplementation((args: unknown) => {
    const { select } = (args ?? {}) as { select?: Record<string, boolean> };
    if (select && "active" in select) return Promise.resolve({ active: true });
    return Promise.resolve(target);
  });
}

describe("POST /api/induction/clear", () => {
  it("rejects an unauthenticated caller", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/induction/clear", {
        body: { userId: "u1", reason: "Experienced coordinator" },
      }),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("rejects a coordinator clearing themselves out of the gate", async () => {
    // The whole point of the gate is that the gated person can't lift it.
    mockSession({ id: "u1", role: "member", name: "Coordinator" });
    const res = await POST(
      createRequest("POST", "/api/induction/clear", {
        body: { userId: "u1", reason: "I am fine honestly" },
      }),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("clears a stuck user and records who did it and why", async () => {
    mockSession({ id: "boss", role: "owner", name: "Jayden" });
    targetUser({ id: "u1", name: "Tracie", inductionStatus: "in_training" });
    prismaMock.user.update.mockResolvedValue({ id: "u1" } as never);
    prismaMock.activityLog.create.mockResolvedValue({ id: "log1" } as never);

    const res = await POST(
      createRequest("POST", "/api/induction/clear", {
        body: { userId: "u1", reason: "Experienced coordinator, not a new starter" },
      }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(prismaMock.user.update.mock.calls[0]?.[0]?.data).toMatchObject({
      inductionStatus: "cleared",
      inductionClearedById: "boss",
    });
    const log = prismaMock.activityLog.create.mock.calls[0]?.[0]?.data as
      | { action?: string; details?: Record<string, unknown> }
      | undefined;
    expect(log?.action).toBe("induction.clear");
    expect(log?.details).toMatchObject({ previousStatus: "in_training" });
  });

  it("demands a reason — this is an audited judgement call", async () => {
    mockSession({ id: "boss", role: "owner", name: "Jayden" });
    const res = await POST(
      createRequest("POST", "/api/induction/clear", {
        body: { userId: "u1", reason: "" },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("treats an already-cleared user as success, not an error", async () => {
    // Two admins reaching for the same stuck account is the likeliest way
    // this ever gets called twice.
    mockSession({ id: "boss", role: "owner", name: "Jayden" });
    targetUser({ id: "u1", name: "Tracie", inductionStatus: "cleared" });

    const res = await POST(
      createRequest("POST", "/api/induction/clear", {
        body: { userId: "u1", reason: "Double click" },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ alreadyCleared: true });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("404s an unknown user rather than writing", async () => {
    mockSession({ id: "boss", role: "owner", name: "Jayden" });
    targetUser(null);
    const res = await POST(
      createRequest("POST", "/api/induction/clear", {
        body: { userId: "ghost", reason: "Tidying up" },
      }),
      ctx,
    );
    expect(res.status).toBe(404);
  });
});

describe("gate satisfiability — every blocker must be re-evaluated", () => {
  // getInductionReadiness has four blockers: courses, WWCC, policies, profile.
  // Courses recompute via onModuleProgressed. These are the other three, and
  // each needs a route that calls refreshInductionAfterBlockerChange — or the
  // user does the work and stays locked forever.
  const BLOCKER_ROUTES: { blocker: string; file: string }[] = [
    { blocker: "wwcc", file: "src/app/api/compliance/route.ts" },
    { blocker: "policies", file: "src/app/api/policies/[id]/acknowledge/route.ts" },
    { blocker: "profile (emergency contact)", file: "src/app/api/users/[id]/emergency-contacts/route.ts" },
    { blocker: "profile (phone)", file: "src/app/api/users/[id]/profile/route.ts" },
    { blocker: "profile (photo)", file: "src/app/api/users/[id]/avatar/route.ts" },
  ];

  for (const { blocker, file } of BLOCKER_ROUTES) {
    it(`${blocker} recomputes induction when resolved`, () => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src).toContain("refreshInductionAfterBlockerChange");
    });
  }
});
