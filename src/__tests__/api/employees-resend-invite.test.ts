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
  passwordResetEmail: vi.fn(() => ({ subject: "Welcome", html: "<p>Welcome</p>" })),
}));

import { POST } from "@/app/api/employees/[id]/resend-invite/route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

interface PendingTarget {
  id?: string;
  name?: string;
  email?: string;
  active?: boolean;
  lastLoginAt?: Date | null;
}
function makePendingTarget(o: PendingTarget = {}) {
  return {
    id: o.id ?? "u-pending",
    name: o.name ?? "Pending User",
    email: o.email ?? "pending@example.com",
    active: o.active ?? true,
    lastLoginAt: o.lastLoginAt ?? null,
  };
}

function setupFindUnique(target: ReturnType<typeof makePendingTarget> | null) {
  prismaMock.user.findUnique.mockImplementation(async (args: unknown) => {
    const a = args as { where?: { id?: string }; select?: Record<string, unknown> };
    if (a?.select && "active" in a.select && !("id" in a.select)) {
      return { active: true };
    }
    if (target && a?.where?.id === target.id) return target;
    return null;
  });
}

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.activityLog.create.mockResolvedValue({} as never);
  prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 0 } as never);
  prismaMock.passwordResetToken.create.mockResolvedValue({} as never);
});

describe("POST /api/employees/[id]/resend-invite", () => {
  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/employees/u-pending/resend-invite"),
      ctx("u-pending") as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when viewer is not admin", async () => {
    mockSession({ id: "m-1", name: "Member", role: "member" });
    setupFindUnique(makePendingTarget());
    const res = await POST(
      createRequest("POST", "/api/employees/u-pending/resend-invite"),
      ctx("u-pending") as never,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when target user does not exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    setupFindUnique(null);
    const res = await POST(
      createRequest("POST", "/api/employees/missing/resend-invite"),
      ctx("missing") as never,
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when target is deactivated", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    setupFindUnique(makePendingTarget({ active: false }));
    const res = await POST(
      createRequest("POST", "/api/employees/u-pending/resend-invite"),
      ctx("u-pending") as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when target has already signed in", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    setupFindUnique(
      makePendingTarget({ lastLoginAt: new Date("2026-04-01T10:00:00Z") }),
    );
    const res = await POST(
      createRequest("POST", "/api/employees/u-pending/resend-invite"),
      ctx("u-pending") as never,
    );
    expect(res.status).toBe(400);
  });

  it("issues a new reset token + writes activity log for pending user", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    setupFindUnique(makePendingTarget());
    const res = await POST(
      createRequest("POST", "/api/employees/u-pending/resend-invite"),
      ctx("u-pending") as never,
    );
    expect(res.status).toBe(200);
    expect(prismaMock.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "u-pending", used: false },
      data: { used: true },
    });
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalled();
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "resend_invite",
          entityType: "User",
          entityId: "u-pending",
        }),
      }),
    );
  });
});
