import { describe, it, expect, beforeEach, vi } from "vitest";
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
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/email", () => ({
  getResend: vi.fn(() => null),
  FROM_EMAIL: "test@test.com",
}));

vi.mock("@/lib/email-templates", () => ({
  passwordResetEmail: vi.fn(() => ({
    subject: "Reset",
    html: "<p>Reset</p>",
  })),
}));

vi.mock("@/lib/onboarding-seed", () => ({
  seedOnboardingPackage: vi.fn(),
}));

import { GET, POST } from "@/app/api/employees/[id]/quick-action/route";
import { seedOnboardingPackage } from "@/lib/onboarding-seed";

const mockedSeed = vi.mocked(seedOnboardingPackage);

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

interface TargetOverrides {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  active?: boolean;
  hrWarningsMuted?: boolean;
}
function makeTarget(overrides: TargetOverrides = {}) {
  return {
    id: overrides.id ?? "u-target",
    name: overrides.name ?? "Target User",
    email: overrides.email ?? "target@example.com",
    role: overrides.role ?? "staff",
    active: overrides.active ?? true,
    hrWarningsMuted: overrides.hrWarningsMuted ?? false,
  };
}

/**
 * Sets up findUnique to:
 *   - return { active: true } for the viewer's own id (withApiAuth check)
 *   - return the given target object for the target id lookup
 *   - return null otherwise (for 404 tests)
 */
function setupFindUnique(_viewerId: string, target: ReturnType<typeof makeTarget> | null) {
  prismaMock.user.findUnique.mockImplementation(async (args: unknown) => {
    const a = args as { where?: { id?: string }; select?: Record<string, unknown> };
    const id = a?.where?.id;
    if (!id) return null;
    if (a?.select && "active" in a.select && !("id" in a.select)) {
      // withApiAuth active-user check
      return { active: true };
    }
    if (target && id === target.id) return target;
    return null;
  });
}

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.activityLog.create.mockResolvedValue({} as never);
  prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 0 } as never);
  prismaMock.passwordResetToken.create.mockResolvedValue({} as never);
  prismaMock.user.update.mockResolvedValue({} as never);
});

describe("GET /api/employees/[id]/quick-action (hasSeparation)", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/employees/u-target/quick-action"),
      ctx("u-target") as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin viewers", async () => {
    mockSession({ id: "m-1", name: "Member", role: "member" });
    setupFindUnique("m-1", makeTarget());
    const res = await GET(
      createRequest("GET", "/api/employees/u-target/quick-action"),
      ctx("u-target") as never,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when target user does not exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    setupFindUnique("admin-1", null);
    const res = await GET(
      createRequest("GET", "/api/employees/missing/quick-action"),
      ctx("missing") as never,
    );
    expect(res.status).toBe(404);
  });

  it("returns hasSeparation: true when a SeparationRecord exists", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    setupFindUnique("admin-1", makeTarget());
    prismaMock.separationRecord.findUnique.mockResolvedValue({
      id: "sep-1",
    } as never);
    const res = await GET(
      createRequest("GET", "/api/employees/u-target/quick-action"),
      ctx("u-target") as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ hasSeparation: true });
    expect(prismaMock.separationRecord.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u-target" } }),
    );
  });

  it("returns hasSeparation: false when no SeparationRecord exists", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    setupFindUnique("admin-1", makeTarget());
    prismaMock.separationRecord.findUnique.mockResolvedValue(null as never);
    const res = await GET(
      createRequest("GET", "/api/employees/u-target/quick-action"),
      ctx("u-target") as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ hasSeparation: false });
  });
});

describe("POST /api/employees/[id]/quick-action", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/employees/u-target/quick-action", {
        body: { action: "reset_password" },
      }),
      ctx("u-target") as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid action", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    setupFindUnique("admin-1", makeTarget());
    const res = await POST(
      createRequest("POST", "/api/employees/u-target/quick-action", {
        body: { action: "delete_universe" },
      }),
      ctx("u-target") as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when target user does not exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    setupFindUnique("admin-1", null);
    const res = await POST(
      createRequest("POST", "/api/employees/missing/quick-action", {
        body: { action: "reset_password" },
      }),
      ctx("missing") as never,
    );
    expect(res.status).toBe(404);
  });

  describe("reset_password", () => {
    it("admin can trigger reset and writes activity log", async () => {
      mockSession({ id: "admin-1", name: "Admin", role: "admin" });
      setupFindUnique("admin-1", makeTarget());
      const res = await POST(
        createRequest("POST", "/api/employees/u-target/quick-action", {
          body: { action: "reset_password" },
        }),
        ctx("u-target") as never,
      );
      expect(res.status).toBe(200);
      expect(prismaMock.passwordResetToken.create).toHaveBeenCalled();
      expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "quick_action.reset_password",
            entityId: "u-target",
          }),
        }),
      );
    });

    it("member viewer is forbidden", async () => {
      mockSession({ id: "m-1", name: "Member", role: "member" });
      setupFindUnique("m-1", makeTarget());
      const res = await POST(
        createRequest("POST", "/api/employees/u-target/quick-action", {
          body: { action: "reset_password" },
        }),
        ctx("u-target") as never,
      );
      expect(res.status).toBe(403);
    });
  });

  describe("trigger_onboarding", () => {
    it("admin can trigger and calls seedOnboardingPackage", async () => {
      mockSession({ id: "admin-1", name: "Admin", role: "admin" });
      setupFindUnique("admin-1", makeTarget());
      const res = await POST(
        createRequest("POST", "/api/employees/u-target/quick-action", {
          body: { action: "trigger_onboarding" },
        }),
        ctx("u-target") as never,
      );
      expect(res.status).toBe(200);
      expect(mockedSeed).toHaveBeenCalledWith("u-target");
    });

    it("member viewer is forbidden", async () => {
      mockSession({ id: "m-1", name: "Member", role: "member" });
      setupFindUnique("m-1", makeTarget());
      const res = await POST(
        createRequest("POST", "/api/employees/u-target/quick-action", {
          body: { action: "trigger_onboarding" },
        }),
        ctx("u-target") as never,
      );
      expect(res.status).toBe(403);
    });
  });

  describe("toggle_admin", () => {
    it("owner can promote member to admin", async () => {
      mockSession({ id: "owner-1", name: "Owner", role: "owner" });
      setupFindUnique("owner-1", makeTarget({ role: "member" }));
      const res = await POST(
        createRequest("POST", "/api/employees/u-target/quick-action", {
          body: { action: "toggle_admin" },
        }),
        ctx("u-target") as never,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.newRole).toBe("admin");
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "u-target" },
          data: { role: "admin" },
        }),
      );
    });

    it("owner toggles admin back to member", async () => {
      mockSession({ id: "owner-1", name: "Owner", role: "owner" });
      setupFindUnique("owner-1", makeTarget({ role: "admin" }));
      const res = await POST(
        createRequest("POST", "/api/employees/u-target/quick-action", {
          body: { action: "toggle_admin" },
        }),
        ctx("u-target") as never,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.newRole).toBe("member");
    });

    it("admin viewer is forbidden", async () => {
      mockSession({ id: "admin-1", name: "Admin", role: "admin" });
      setupFindUnique("admin-1", makeTarget());
      const res = await POST(
        createRequest("POST", "/api/employees/u-target/quick-action", {
          body: { action: "toggle_admin" },
        }),
        ctx("u-target") as never,
      );
      expect(res.status).toBe(403);
    });

    it("owner cannot self-toggle", async () => {
      mockSession({ id: "owner-1", name: "Owner", role: "owner" });
      setupFindUnique("owner-1", makeTarget({ id: "owner-1" }));
      const res = await POST(
        createRequest("POST", "/api/employees/owner-1/quick-action", {
          body: { action: "toggle_admin" },
        }),
        ctx("owner-1") as never,
      );
      expect(res.status).toBe(400);
    });
  });

  describe("toggle_active", () => {
    it("admin can deactivate a staff member", async () => {
      mockSession({ id: "admin-1", name: "Admin", role: "admin" });
      setupFindUnique("admin-1", makeTarget({ role: "staff", active: true }));
      const res = await POST(
        createRequest("POST", "/api/employees/u-target/quick-action", {
          body: { action: "toggle_active" },
        }),
        ctx("u-target") as never,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.newActive).toBe(false);
    });

    it("admin cannot deactivate another admin (owner-only)", async () => {
      mockSession({ id: "admin-1", name: "Admin", role: "admin" });
      setupFindUnique("admin-1", makeTarget({ role: "admin", active: true }));
      const res = await POST(
        createRequest("POST", "/api/employees/u-target/quick-action", {
          body: { action: "toggle_active" },
        }),
        ctx("u-target") as never,
      );
      expect(res.status).toBe(403);
    });

    it("owner can deactivate another admin", async () => {
      mockSession({ id: "owner-1", name: "Owner", role: "owner" });
      setupFindUnique("owner-1", makeTarget({ role: "admin", active: true }));
      const res = await POST(
        createRequest("POST", "/api/employees/u-target/quick-action", {
          body: { action: "toggle_active" },
        }),
        ctx("u-target") as never,
      );
      expect(res.status).toBe(200);
    });

    it("cannot deactivate self", async () => {
      mockSession({ id: "admin-1", name: "Admin", role: "admin" });
      setupFindUnique("admin-1", makeTarget({ id: "admin-1", role: "admin" }));
      const res = await POST(
        createRequest("POST", "/api/employees/admin-1/quick-action", {
          body: { action: "toggle_active" },
        }),
        ctx("admin-1") as never,
      );
      expect(res.status).toBe(400);
    });

    it("member viewer is forbidden", async () => {
      mockSession({ id: "m-1", name: "Member", role: "member" });
      setupFindUnique("m-1", makeTarget());
      const res = await POST(
        createRequest("POST", "/api/employees/u-target/quick-action", {
          body: { action: "toggle_active" },
        }),
        ctx("u-target") as never,
      );
      expect(res.status).toBe(403);
    });
  });

  describe("toggle_hr_warnings_muted", () => {
    it("admin can mute the payroll/contract warnings for an account", async () => {
      mockSession({ id: "admin-1", name: "Admin", role: "admin" });
      setupFindUnique("admin-1", makeTarget({ hrWarningsMuted: false }));
      const res = await POST(
        createRequest("POST", "/api/employees/u-target/quick-action", {
          body: { action: "toggle_hr_warnings_muted" },
        }),
        ctx("u-target") as never,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.newHrWarningsMuted).toBe(true);
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "u-target" },
          data: { hrWarningsMuted: true },
        }),
      );
      expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "quick_action.mute_hr_warnings",
            entityId: "u-target",
          }),
        }),
      );
    });

    it("admin can unmute a previously-muted account", async () => {
      mockSession({ id: "admin-1", name: "Admin", role: "admin" });
      setupFindUnique("admin-1", makeTarget({ hrWarningsMuted: true }));
      const res = await POST(
        createRequest("POST", "/api/employees/u-target/quick-action", {
          body: { action: "toggle_hr_warnings_muted" },
        }),
        ctx("u-target") as never,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.newHrWarningsMuted).toBe(false);
    });

    it("member viewer is forbidden", async () => {
      mockSession({ id: "m-1", name: "Member", role: "member" });
      setupFindUnique("m-1", makeTarget());
      const res = await POST(
        createRequest("POST", "/api/employees/u-target/quick-action", {
          body: { action: "toggle_hr_warnings_muted" },
        }),
        ctx("u-target") as never,
      );
      expect(res.status).toBe(403);
    });
  });
});
