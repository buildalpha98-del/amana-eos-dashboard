import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(() => Promise.resolve(false)),
    hash: vi.fn(() => Promise.resolve("$2a$12$hashed")),
  },
  compare: vi.fn(() => Promise.resolve(false)),
  hash: vi.fn(() => Promise.resolve("$2a$12$hashed")),
}));

// Mock password-breach-check
vi.mock("@/lib/password-breach-check", () => ({
  checkPasswordBreach: vi.fn(() => 0),
}));

// Mock audit-log
vi.mock("@/lib/audit-log", () => ({
  logAuditEvent: vi.fn(),
}));

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { POST as resetPassword, GET as validateToken } from "@/app/api/auth/reset-password/route";
import { _clearUserActiveCache } from "@/lib/server-auth";
import bcrypt from "bcryptjs";
import { checkRateLimit } from "@/lib/rate-limit";

describe("POST /api/auth/change-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({
      active: true,
      id: "user-1",
      email: "test@test.com",
      passwordHash: "$2a$12$existinghash",
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/auth/change-password", {
      body: { currentPassword: "old", newPassword: "new" },
    });
    const res = await changePassword(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when current password is missing", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    const req = createRequest("POST", "/api/auth/change-password", {
      body: { newPassword: "NewPass123!" },
    });
    const res = await changePassword(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  it("returns 400 when new password is missing", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    const req = createRequest("POST", "/api/auth/change-password", {
      body: { currentPassword: "OldPass123!" },
    });
    const res = await changePassword(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  it("returns 400 when current password is incorrect", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const req = createRequest("POST", "/api/auth/change-password", {
      body: { currentPassword: "WrongPass123!", newPassword: "NewSecure123!!" },
    });
    const res = await changePassword(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("incorrect");
  });

  it("returns 400 when new password fails validation (too short)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const req = createRequest("POST", "/api/auth/change-password", {
      body: { currentPassword: "OldPass123!", newPassword: "short" },
    });
    const res = await changePassword(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 200 on successful password change", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    prismaMock.user.update.mockResolvedValue({});

    const req = createRequest("POST", "/api/auth/change-password", {
      body: { currentPassword: "OldPass123!", newPassword: "NewSecure123!!" },
    });
    const res = await changePassword(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("successfully");
  });

  it("returns 404 when user not found in DB", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    // First call for active check returns active, second call for user lookup returns null
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ active: true })
      .mockResolvedValueOnce(null);

    const req = createRequest("POST", "/api/auth/change-password", {
      body: { currentPassword: "OldPass123!", newPassword: "NewSecure123!!" },
    });
    const res = await changePassword(req);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: false } as any);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: true } as any);

    const req = createRequest("POST", "/api/auth/reset-password", {
      body: { token: "abc", password: "NewSecure123!!" },
    });
    const res = await resetPassword(req);
    expect(res.status).toBe(429);
  });

  it("returns 400 when token is missing", async () => {
    const req = createRequest("POST", "/api/auth/reset-password", {
      body: { password: "NewSecure123!!" },
    });
    const res = await resetPassword(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("token");
  });

  it("returns 400 when password fails validation", async () => {
    const req = createRequest("POST", "/api/auth/reset-password", {
      body: { token: "valid-token", password: "weak" },
    });
    const res = await resetPassword(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);

    const req = createRequest("POST", "/api/auth/reset-password", {
      body: { token: "invalid-token", password: "NewSecure123!!" },
    });
    const res = await resetPassword(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid");
  });

  it("returns 400 for already-used token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      token: "used-token",
      used: true,
      expiresAt: new Date(Date.now() + 3600000),
      userId: "user-1",
      user: { email: "test@test.com" },
    });

    const req = createRequest("POST", "/api/auth/reset-password", {
      body: { token: "used-token", password: "NewSecure123!!" },
    });
    const res = await resetPassword(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("already been used");
  });

  it("returns 400 for expired token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      token: "expired-token",
      used: false,
      expiresAt: new Date(Date.now() - 3600000),
      userId: "user-1",
      user: { email: "test@test.com" },
    });

    const req = createRequest("POST", "/api/auth/reset-password", {
      body: { token: "expired-token", password: "NewSecure123!!" },
    });
    const res = await resetPassword(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("expired");
  });

  it("resets password successfully with valid token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      token: "valid-token",
      used: false,
      expiresAt: new Date(Date.now() + 3600000),
      userId: "user-1",
      user: { email: "test@test.com" },
    });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.passwordResetToken.update.mockResolvedValue({});

    const req = createRequest("POST", "/api/auth/reset-password", {
      body: { token: "valid-token", password: "NewSecure123!!" },
    });
    const res = await resetPassword(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("reset successfully");
  });
});

describe("GET /api/auth/reset-password (validate token)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when token param is missing", async () => {
    const req = createRequest("GET", "/api/auth/reset-password");
    const res = await validateToken(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  it("returns valid:false for unknown token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);
    const req = createRequest("GET", "/api/auth/reset-password?token=unknown");
    const res = await validateToken(req);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  it("returns valid:true for valid token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      token: "good-token",
      used: false,
      expiresAt: new Date(Date.now() + 3600000),
    });
    const req = createRequest("GET", "/api/auth/reset-password?token=good-token");
    const res = await validateToken(req);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });
});
