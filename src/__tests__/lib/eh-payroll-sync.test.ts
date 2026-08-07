/**
 * runEmployeeSync — the daily User ↔ EH Payroll employee mapping.
 *
 * The dangerous half of this sync is the CLEAR pass: it nulls
 * `employmentHeroEmployeeId` for anyone it decides is terminated. The
 * 2026-08 incident: listEmployees silently truncated at 100 rows, so
 * mapped employees past page 1 looked "missing" and had their mappings
 * wiped (9 in one run). These tests pin the guard rails:
 *   - never clear against an empty employee list (abort loudly)
 *   - clear only on genuine terminated/missing employees
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

const listEmployees = vi.fn();
vi.mock("@/lib/eh-payroll", () => ({
  listEmployees: (...args: unknown[]) => listEmployees(...args),
}));

import { runEmployeeSync } from "@/lib/eh-payroll-sync";

function eh(id: number, email: string | null, status = "Active") {
  return { id, firstName: "F", surname: "L", email, status, startDate: null, externalId: null };
}

function dbUser(id: string, email: string, ehId: number | null, active = true) {
  return { id, name: `User ${id}`, email, active, employmentHeroEmployeeId: ehId };
}

describe("runEmployeeSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.update.mockResolvedValue({});
  });

  it("keeps a mapping when the EH employee is still Active", async () => {
    listEmployees.mockResolvedValue([eh(100, "a@test.com")]);
    prismaMock.user.findMany.mockResolvedValue([dbUser("u1", "a@test.com", 100)]);

    const summary = await runEmployeeSync();
    expect(summary.unchanged).toBe(1);
    expect(summary.cleared).toBe(0);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("clears a mapping when the EH employee is Terminated", async () => {
    listEmployees.mockResolvedValue([eh(100, "a@test.com", "Terminated")]);
    prismaMock.user.findMany.mockResolvedValue([dbUser("u1", "a@test.com", 100)]);

    const summary = await runEmployeeSync();
    expect(summary.cleared).toBe(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { employmentHeroEmployeeId: null },
    });
  });

  it("clears a mapping when the employee is missing from a non-empty complete list", async () => {
    listEmployees.mockResolvedValue([eh(999, "other@test.com")]);
    prismaMock.user.findMany.mockResolvedValue([dbUser("u1", "a@test.com", 100)]);

    const summary = await runEmployeeSync();
    expect(summary.cleared).toBe(1);
  });

  it("REFUSES to run against an empty employee list — no mappings touched", async () => {
    listEmployees.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([dbUser("u1", "a@test.com", 100)]);

    await expect(runEmployeeSync()).rejects.toThrow(/0 employees/);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("auto-maps an unmapped active user by (case-insensitive) email", async () => {
    listEmployees.mockResolvedValue([eh(200, "New.Starter@Test.com")]);
    prismaMock.user.findMany.mockResolvedValue([dbUser("u2", "new.starter@test.com ", null)]);

    const summary = await runEmployeeSync();
    expect(summary.newlyMapped).toBe(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { employmentHeroEmployeeId: 200 },
    });
  });

  it("does not map to a non-Active EH employee; reports unmatched instead", async () => {
    listEmployees.mockResolvedValue([eh(200, "new@test.com", "Incomplete")]);
    prismaMock.user.findMany.mockResolvedValue([dbUser("u2", "new@test.com", null)]);

    const summary = await runEmployeeSync();
    expect(summary.newlyMapped).toBe(0);
    expect(summary.unmatchedCount).toBe(1);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
