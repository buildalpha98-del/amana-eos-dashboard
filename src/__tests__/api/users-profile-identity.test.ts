/**
 * Tests for the name/email identity-field handling on
 * PATCH /api/users/[id]/profile.
 *
 * Matrix:
 *   - Admin updating another user's name + email → 200, prisma.user.update called
 *   - Self updating own name + email → 200
 *   - Non-admin member updating another user's name → 403 (in STAFF_SELF_FIELDS
 *     but the route's gate `!isAdmin && !isSelf` blocks first)
 *   - Email collision with another user → 409
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
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

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn((v: string) => `encrypted:${v}`),
}));

import { PATCH } from "@/app/api/users/[id]/profile/route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
});

describe("PATCH /api/users/[id]/profile — identity fields", () => {
  it("admin can update another user's name and email", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    // First findUnique: active check on viewer. Second: target lookup. Third
    // (email-collision): finding any user with the new email.
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string; email?: string } }) => {
      if (where?.id === "admin-1") return Promise.resolve({ active: true });
      if (where?.id === "target-1") {
        return Promise.resolve({ id: "target-1", email: "old@example.com" });
      }
      if (where?.email === "new@example.com") return Promise.resolve(null);
      return Promise.resolve(null);
    });
    prismaMock.user.update.mockResolvedValue({ id: "target-1" } as never);
    prismaMock.activityLog.create.mockResolvedValue({} as never);

    const res = await PATCH(
      createRequest("PATCH", "/api/users/target-1/profile", {
        body: { name: "New Name", email: "new@example.com" },
      }),
      ctx("target-1"),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "target-1" },
        data: expect.objectContaining({
          name: "New Name",
          email: "new@example.com",
        }),
      }),
    );
  });

  it("a staff member can update their own name and email (self-edit)", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string; email?: string } }) => {
      if (where?.id === "staff-1") return Promise.resolve({ active: true, id: "staff-1", email: "old@example.com" });
      if (where?.email === "self@example.com") return Promise.resolve(null);
      return Promise.resolve(null);
    });
    prismaMock.user.update.mockResolvedValue({ id: "staff-1" } as never);
    prismaMock.activityLog.create.mockResolvedValue({} as never);

    const res = await PATCH(
      createRequest("PATCH", "/api/users/staff-1/profile", {
        body: { name: "Updated Self", email: "self@example.com" },
      }),
      ctx("staff-1"),
    );

    expect(res.status).toBe(200);
  });

  it("a non-admin cannot update another user's name (target ≠ self)", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    const res = await PATCH(
      createRequest("PATCH", "/api/users/other-1/profile", {
        body: { name: "Hacked" },
      }),
      ctx("other-1"),
    );

    expect(res.status).toBe(403);
  });

  it("returns 409 when updating email to one already taken by another user", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockImplementation(({ where }: { where?: { id?: string; email?: string } }) => {
      if (where?.id === "admin-1") return Promise.resolve({ active: true });
      if (where?.id === "target-1") {
        return Promise.resolve({ id: "target-1", email: "old@example.com" });
      }
      if (where?.email === "taken@example.com") {
        return Promise.resolve({ id: "someone-else" });
      }
      return Promise.resolve(null);
    });
    prismaMock.user.update.mockResolvedValue({ id: "target-1" } as never);

    const res = await PATCH(
      createRequest("PATCH", "/api/users/target-1/profile", {
        body: { email: "taken@example.com" },
      }),
      ctx("target-1"),
    );

    expect(res.status).toBe(409);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("updating to the same email the user already has does NOT trigger the collision check", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const calls: { where: { id?: string; email?: string } }[] = [];
    prismaMock.user.findUnique.mockImplementation((args: { where: { id?: string; email?: string } }) => {
      calls.push(args);
      if (args.where?.id === "admin-1") return Promise.resolve({ active: true });
      if (args.where?.id === "target-1") {
        return Promise.resolve({ id: "target-1", email: "same@example.com" });
      }
      return Promise.resolve(null);
    });
    prismaMock.user.update.mockResolvedValue({ id: "target-1" } as never);
    prismaMock.activityLog.create.mockResolvedValue({} as never);

    const res = await PATCH(
      createRequest("PATCH", "/api/users/target-1/profile", {
        body: { email: "same@example.com" },
      }),
      ctx("target-1"),
    );

    expect(res.status).toBe(200);
    // No findUnique call with `where: { email: ... }` should have been made
    // because the new email matches the user's existing email.
    expect(calls.some((c) => c.where?.email !== undefined)).toBe(false);
  });
});
