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
    subject: "Welcome",
    html: "<p>Welcome</p>",
  })),
}));

import { POST } from "@/app/api/users/bulk-resend-invite/route";

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.activityLog.create.mockResolvedValue({} as never);
  prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 0 } as never);
  prismaMock.passwordResetToken.create.mockResolvedValue({} as never);
});

describe("POST /api/users/bulk-resend-invite", () => {
  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/users/bulk-resend-invite"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when viewer is not admin", async () => {
    mockSession({ id: "m-1", name: "Member", role: "member" });
    const res = await POST(
      createRequest("POST", "/api/users/bulk-resend-invite"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with 0 counts when no users are pending", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([]);
    const res = await POST(
      createRequest("POST", "/api/users/bulk-resend-invite"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resent).toBe(0);
    expect(body.failed).toBe(0);
  });

  it("resends invites to every pending user + writes per-user activity logs", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-1", name: "Alice", email: "alice@test.com" },
      { id: "u-2", name: "Bob", email: "bob@test.com" },
      { id: "u-3", name: "Carol", email: "carol@test.com" },
    ]);

    const res = await POST(
      createRequest("POST", "/api/users/bulk-resend-invite"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resent).toBe(3);
    expect(body.failed).toBe(0);

    // Filter pending users by active + null lastLogin
    const findManyCall = prismaMock.user.findMany.mock.calls[0][0];
    expect(findManyCall.where.active).toBe(true);
    expect(findManyCall.where.lastLoginAt).toBeNull();

    // 3 tokens issued, 3 activity logs
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalledTimes(3);
    expect(prismaMock.activityLog.create).toHaveBeenCalledTimes(3);
  });

  it("isolates per-user failures — one bad email doesn't kill the batch", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-1", name: "Alice", email: "alice@test.com" },
      { id: "u-2", name: "Bob", email: "bob@test.com" },
    ]);
    // Make the second token create reject to simulate a per-user error.
    let createCalls = 0;
    prismaMock.passwordResetToken.create.mockImplementation(async () => {
      createCalls++;
      if (createCalls === 2) throw new Error("DB hiccup");
      return {} as never;
    });

    const res = await POST(
      createRequest("POST", "/api/users/bulk-resend-invite"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resent).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.failures[0].email).toBe("bob@test.com");
  });
});
