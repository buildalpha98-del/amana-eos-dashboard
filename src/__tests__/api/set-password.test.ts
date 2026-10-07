import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(() => Promise.resolve(false)),
    hash: vi.fn(() => Promise.resolve("$2a$12$hashed")),
  },
  compare: vi.fn(() => Promise.resolve(false)),
  hash: vi.fn(() => Promise.resolve("$2a$12$hashed")),
}));
vi.mock("@/lib/password-breach-check", () => ({ checkPasswordBreach: vi.fn(() => 0) }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { POST } from "@/app/api/auth/set-password/route";
import { _clearUserActiveCache } from "@/lib/server-auth";
import bcrypt from "bcryptjs";
import { checkPasswordBreach } from "@/lib/password-breach-check";

const GOOD = "Sunrise#Bell2026";
const req = (newPassword?: unknown) =>
  createRequest("POST", "/api/auth/set-password", { body: { newPassword } });

describe("POST /api/auth/set-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    mockSession({ id: "user-1", name: "New Starter", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue({
      active: true,
      id: "user-1",
      passwordHash: "$2a$12$temp",
      mustChangePassword: true,
    });
    prismaMock.user.update.mockResolvedValue({ id: "user-1" });
  });

  it("401s without a session", async () => {
    mockNoSession();
    const res = await POST(req(GOOD));
    expect(res.status).toBe(401);
  });

  it("sets the password, clears the flag and ends other sessions", async () => {
    const res = await POST(req(GOOD));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        passwordHash: "$2a$12$hashed",
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    });
  });

  it("refuses when the password was not a temporary one", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      active: true,
      id: "user-1",
      passwordHash: "$2a$12$own",
      mustChangePassword: false,
    });
    const res = await POST(req(GOOD));
    expect(res.status).toBe(409);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects a weak password", async () => {
    const res = await POST(req("short"));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects re-using the temporary password", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);
    const res = await POST(req(GOOD));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects a breached password", async () => {
    vi.mocked(checkPasswordBreach).mockResolvedValueOnce(12 as never);
    const res = await POST(req(GOOD));
    expect(res.status).toBe(400);
  });
});
