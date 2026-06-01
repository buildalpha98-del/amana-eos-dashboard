/**
 * Tests for `requireOwnEmployee` — the guard that gates every My Portal
 * payroll endpoint. This is security-critical: a missing case here
 * could let a hostile or buggy route hand back another user's payslip.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { requireOwnEmployee } from "@/lib/eh-payroll-auth";
import { ApiError } from "@/lib/api-error";
import type { Session } from "next-auth";

function mkSession(userId: string): Session {
  return {
    user: { id: userId, name: "Test", email: "t@example.com" },
    expires: new Date(Date.now() + 86400000).toISOString(),
    // Other fields aren't read by the guard — cast loose.
  } as unknown as Session;
}

beforeEach(() => {
  // prismaMock state resets in the helper's beforeEach.
});

describe("requireOwnEmployee", () => {
  it("returns the employee id when the user is active and mapped", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      active: true,
      employmentHeroEmployeeId: 9176721,
    });
    const out = await requireOwnEmployee(mkSession("u-1"));
    expect(out).toBe(9176721);
  });

  it("throws 401 ApiError when the user is missing from the DB", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    try {
      await requireOwnEmployee(mkSession("u-missing"));
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(401);
    }
  });

  it("throws 403 ApiError when the user is deactivated", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      active: false,
      employmentHeroEmployeeId: 9176721,
    });
    try {
      await requireOwnEmployee(mkSession("u-inactive"));
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(403);
    }
  });

  it("throws 404 ApiError when the user has no payroll mapping", async () => {
    // The most important case: an active user with employmentHeroEmployeeId
    // = null must NOT silently fall through. Returning here would let the
    // caller fetch *no* employee — but the surrounding route assumes the
    // returned number is valid, so any failure mode that returns 0 / NaN
    // could be exploited. We throw, hard, with a human-readable hint.
    prismaMock.user.findUnique.mockResolvedValue({
      active: true,
      employmentHeroEmployeeId: null,
    });
    try {
      await requireOwnEmployee(mkSession("u-unmapped"));
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
      // Should mention "manager" so the UI hint matches the API message.
      expect((err as ApiError).message.toLowerCase()).toContain("manager");
    }
  });

  it("queries Prisma with the session's user id (not an external param)", async () => {
    // Belt-and-braces test that the guard sources identity from the
    // session, never from a URL or body param. The bug we're guarding
    // against would be silent — if the where clause ever looked up
    // a parameter from outside the session, we'd never know.
    prismaMock.user.findUnique.mockResolvedValue({
      active: true,
      employmentHeroEmployeeId: 1,
    });
    await requireOwnEmployee(mkSession("u-canonical-id"));
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u-canonical-id" } }),
    );
  });
});
